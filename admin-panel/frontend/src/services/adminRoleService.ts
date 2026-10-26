import { collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from '../firebase';

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  grantedBy: string;
  grantedAt: string;
  photoURL?: string | null;
}

export interface AdminInvitation {
  id: string;
  email: string;
  status: 'pending' | 'accepted';
  role?: 'superadmin' | 'admin';
  invitedBy: string;
  invitedAt: string;
  expiresAt?: string | null;
  token?: string | null;
  acceptUrl?: string | null;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://ems-admin-backend.onrender.com';

async function getAuthHeader(): Promise<Record<string, string>> {
  if (auth.currentUser) {
    const idToken = await auth.currentUser.getIdToken();
    return {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    };
  }
  return { 'Content-Type': 'application/json' };
}

/**
 * Lists all active administrators and pending admin invitations.
 */
export async function getAdminsAndInvitations(): Promise<{
  admins: AdminUser[];
  invitations: AdminInvitation[];
}> {
  // 1. Try Cloud Function first
  try {
    const listAdminsFn = httpsCallable<void, { admins: AdminUser[]; invitations: AdminInvitation[] }>(
      functions,
      'listAdmins'
    );
    const result = await listAdminsFn();
    if (result.data && Array.isArray(result.data.admins)) {
      return result.data;
    }
  } catch (err) {
    console.warn('listAdmins callable failed, checking backend API:', err);
  }

  // 2. Try Express Backend API
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE_URL}/api/admin/invitations`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.admins)) {
        return data;
      }
    }
  } catch (apiErr) {
    console.warn('Backend API /api/admin/invitations failed, falling back to direct Firestore:', apiErr);
  }

  // 3. Fallback: Direct Firestore collection reads
  const [adminsSnap, invitesSnap] = await Promise.all([
    getDocs(collection(db, 'admins')),
    getDocs(collection(db, 'admin_invitations')),
  ]);

  const adminsMap = new Map<string, AdminUser>();
  adminsSnap.forEach((d) => {
    const data = d.data();
    const email = (data.email || '').toLowerCase().trim();
    if (!email) return;

    const record: AdminUser = {
      uid: d.id,
      email: data.email || '—',
      displayName: data.displayName || data.name || data.email?.split('@')[0] || 'Admin',
      role: data.role || 'admin',
      grantedBy: data.grantedBy || 'system',
      grantedAt: data.grantedAt?.toDate?.()
        ? data.grantedAt.toDate().toISOString()
        : String(data.grantedAt || (data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.createdAt || '')),
      photoURL: data.photoURL || null,
    };

    if (adminsMap.has(email)) {
      const existing = adminsMap.get(email)!;
      if (!existing.grantedAt && record.grantedAt) {
        adminsMap.set(email, record);
      } else if (existing.uid.startsWith('legit_') || existing.uid.startsWith('test_')) {
        adminsMap.set(email, record);
      }
    } else {
      adminsMap.set(email, record);
    }
  });

  const admins = Array.from(adminsMap.values());

  const invitations: AdminInvitation[] = [];
  const activeAdminEmails = new Set(admins.map((a) => a.email.toLowerCase()));

  invitesSnap.forEach((d) => {
    const data = d.data();
    const invEmail = (data.email || d.id).toLowerCase();
    const status = data.status || 'pending';

    // If invitation has status accepted OR if the email is already in active admins, don't show as pending
    if (status !== 'pending' || activeAdminEmails.has(invEmail)) {
      return;
    }

    invitations.push({
      id: d.id,
      email: data.email || d.id,
      status: 'pending',
      role: data.role || 'admin',
      invitedBy: data.invitedBy || 'Admin',
      invitedAt: data.invitedAt?.toDate?.() ? data.invitedAt.toDate().toISOString() : String(data.invitedAt || ''),
      expiresAt: data.expiresAt?.toDate?.() ? data.expiresAt.toDate().toISOString() : data.expiresAt || null,
      token: data.token || null,
      acceptUrl: data.acceptUrl || null,
    });
  });

  return { admins, invitations };
}

/**
 * Grants admin or superadmin role to an email address and dispatches an invitation.
 */
export async function grantAdmin(
  email: string,
  role: 'superadmin' | 'admin' = 'admin'
): Promise<{
  success: boolean;
  status: string;
  message: string;
  acceptUrl?: string;
  role?: string;
}> {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Primary: Authoritative Express Backend API
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE_URL}/api/admin/invitations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: cleanEmail, role }),
    });
    const data = await res.json();
    if (res.ok) {
      return data;
    }
    if (data.error && !data.error.includes('HTTP 5')) {
      throw new Error(data.error);
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes('fetch') && !apiErr.message.includes('network')) {
      throw apiErr;
    }
    console.warn('Express /api/admin/invitations failed, checking Cloud Function fallback:', apiErr);
  }

  // 2. Secondary: Cloud Function Fallback
  try {
    const grantFn = httpsCallable<
      { email: string; role?: string },
      { success: boolean; status: string; message: string; acceptUrl?: string }
    >(functions, 'grantAdminRole');
    const result = await grantFn({ email: cleanEmail, role });
    if (result.data) {
      return result.data;
    }
  } catch (err: any) {
    throw new Error(err.message || 'Could not generate admin invitation.');
  }

  throw new Error('Could not generate admin invitation.');
}

/**
 * Verifies an invitation token before accepting.
 */
export async function verifyInvitation(
  token: string,
  email?: string
): Promise<{ valid: boolean; email?: string; role?: 'superadmin' | 'admin'; invitedBy?: string; reason?: string }> {
  // 1. Primary: Express Backend API
  try {
    const url = new URL(`${API_BASE_URL}/api/admin/invitations/verify`);
    url.searchParams.set('token', token);
    if (email) url.searchParams.set('email', email);

    const res = await fetch(url.toString());
    const data = await res.json();
    if (res.ok) return data;
  } catch (apiErr: any) {
    console.warn('verifyInvitation API note, checking Cloud Function fallback:', apiErr);
  }

  // 2. Secondary: Cloud Function Fallback
  try {
    const verifyFn = httpsCallable<
      { token: string; email?: string },
      { valid: boolean; email?: string; invitedBy?: string; reason?: string }
    >(functions, 'verifyInvitationToken');
    const result = await verifyFn({ token, email });
    if (result.data) {
      return result.data;
    }
  } catch (err: any) {
    console.warn('verifyInvitationToken callable failed:', err);
  }

  return { valid: false, reason: 'Failed to verify invitation. Please check your network connection.' };
}

/**
 * Accepts an invitation token using the current user's Google session.
 */
export async function acceptInvitation(token: string): Promise<{ success: boolean; message: string }> {
  // 1. Primary: Express Backend API
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE_URL}/api/admin/invitations/accept`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (res.ok) {
      return data;
    }
    if (data.error && !data.error.includes('HTTP 5')) {
      throw new Error(data.error);
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes('fetch') && !apiErr.message.includes('network')) {
      throw apiErr;
    }
    console.warn('Express accept invitation failed, checking Cloud Function fallback:', apiErr);
  }

  // 2. Secondary: Cloud Function Fallback
  try {
    const acceptFn = httpsCallable<{ token: string }, { success: boolean; message: string }>(
      functions,
      'acceptAdminInvitation'
    );
    const result = await acceptFn({ token });
    if (result.data) {
      return result.data;
    }
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to accept invitation.');
  }

  throw new Error('Failed to accept invitation.');
}

export const PRIMARY_SUPERADMIN_EMAIL = 'akashprabhu0302@gmail.com';

/**
 * Revokes admin role from a user.
 */
export async function revokeAdmin(uid?: string, email?: string): Promise<{ success: boolean; message: string }> {
  const currentEmail = auth.currentUser?.email?.toLowerCase().trim();
  const cleanEmail = email?.trim().toLowerCase();

  // Protect akashprabhu0302@gmail.com from ever being revoked
  if (cleanEmail === PRIMARY_SUPERADMIN_EMAIL.toLowerCase()) {
    throw new Error('The primary site owner (akashprabhu0302@gmail.com) cannot be revoked.');
  }

  if (uid && uid === auth.currentUser?.uid) {
    throw new Error('You cannot revoke your own administrator account.');
  }

  // 1. Primary: Express Backend API
  if (cleanEmail) {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE_URL}/api/admin/invitations/${encodeURIComponent(cleanEmail)}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        return await res.json();
      }
      const data = await res.json().catch(() => ({}));
      if (data?.error) {
        throw new Error(data.error);
      }
    } catch (apiErr: any) {
      if (apiErr?.message && !apiErr.message.includes('fetch') && !apiErr.message.includes('network')) {
        throw apiErr;
      }
      console.warn('Backend DELETE /invitations failed, checking Cloud Function fallback:', apiErr);
    }
  }

  // 2. Secondary: Cloud Function Fallback
  try {
    const revokeFn = httpsCallable<{ uid?: string; email?: string }, { success: boolean; message: string }>(
      functions,
      'revokeAdminRole'
    );
    const result = await revokeFn({ uid, email: cleanEmail });
    if (result.data) {
      return result.data;
    }
  } catch (err: any) {
    throw new Error(err.message || 'Failed to revoke administrator.');
  }

  throw new Error('Failed to revoke administrator.');
}
