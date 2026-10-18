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
  invitedBy: string;
  invitedAt: string;
  expiresAt?: string | null;
  token?: string | null;
  acceptUrl?: string | null;
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
    console.warn('listAdmins callable failed, falling back to direct Firestore:', err);
  }

  // 2. Fallback: Direct Firestore collection reads
  const [adminsSnap, invitesSnap] = await Promise.all([
    getDocs(collection(db, 'admins')),
    getDocs(collection(db, 'admin_invitations')),
  ]);

  const admins: AdminUser[] = [];
  adminsSnap.forEach((d) => {
    const data = d.data();
    admins.push({
      uid: d.id,
      email: data.email || '—',
      displayName: data.displayName || data.email?.split('@')[0] || 'Admin',
      role: data.role || 'admin',
      grantedBy: data.grantedBy || 'system',
      grantedAt: data.grantedAt?.toDate?.() ? data.grantedAt.toDate().toISOString() : String(data.grantedAt || ''),
      photoURL: data.photoURL || null,
    });
  });

  const invitations: AdminInvitation[] = [];
  invitesSnap.forEach((d) => {
    const data = d.data();
    invitations.push({
      id: d.id,
      email: data.email || d.id,
      status: data.status || 'pending',
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
 * Grants admin role to an email address and dispatches an email via Resend.
 */
export async function grantAdmin(email: string): Promise<{
  success: boolean;
  status: string;
  message: string;
  acceptUrl?: string;
}> {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Try Cloud Function
  try {
    const grantFn = httpsCallable<
      { email: string },
      { success: boolean; status: string; message: string; acceptUrl?: string }
    >(functions, 'grantAdminRole');
    const result = await grantFn({ email: cleanEmail });
    return result.data;
  } catch (err: any) {
    console.warn('grantAdminRole callable failed, falling back to Firestore invitation:', err);
  }

  // 2. Direct Firestore fallback: create pending invitation
  const callerEmail = auth.currentUser?.email || auth.currentUser?.uid || 'Admin';
  await setDoc(doc(db, 'admin_invitations', cleanEmail), {
    email: cleanEmail,
    status: 'pending',
    invitedBy: callerEmail,
    invitedAt: serverTimestamp(),
  });

  return {
    success: true,
    status: 'invited',
    message: `Invitation recorded for ${cleanEmail}. An invitation has been queued.`,
  };
}

/**
 * Resends an invitation email to a pending administrator.
 */
export async function resendInvitation(email: string): Promise<{ success: boolean; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const resendFn = httpsCallable<{ email: string }, { success: boolean; message: string }>(
    functions,
    'resendAdminInvitation'
  );
  const result = await resendFn({ email: cleanEmail });
  return result.data;
}

/**
 * Verifies an invitation token before accepting.
 */
export async function verifyInvitation(
  token: string,
  email: string
): Promise<{ valid: boolean; email?: string; invitedBy?: string; reason?: string }> {
  const verifyFn = httpsCallable<
    { token: string; email: string },
    { valid: boolean; email?: string; invitedBy?: string; reason?: string }
  >(functions, 'verifyInvitationToken');
  const result = await verifyFn({ token, email });
  return result.data;
}

/**
 * Accepts an invitation token using the current user's Google session.
 */
export async function acceptInvitation(token: string): Promise<{ success: boolean; message: string }> {
  const acceptFn = httpsCallable<{ token: string }, { success: boolean; message: string }>(
    functions,
    'acceptAdminInvitation'
  );
  const result = await acceptFn({ token });
  return result.data;
}

/**
 * Revokes admin role from a user.
 */
export async function revokeAdmin(uid?: string, email?: string): Promise<{ success: boolean; message: string }> {
  if (uid && uid === auth.currentUser?.uid) {
    throw new Error('You cannot revoke your own administrator account.');
  }

  // 1. Try Cloud Function
  try {
    const revokeFn = httpsCallable<{ uid?: string; email?: string }, { success: boolean; message: string }>(
      functions,
      'revokeAdminRole'
    );
    const result = await revokeFn({ uid, email });
    return result.data;
  } catch (err: any) {
    console.warn('revokeAdminRole callable failed, falling back to direct Firestore removal:', err);
  }

  // 2. Direct Firestore fallback
  if (uid) {
    await deleteDoc(doc(db, 'admins', uid));
  }
  if (email) {
    await deleteDoc(doc(db, 'admin_invitations', email.toLowerCase()));
  }

  return {
    success: true,
    message: `Admin access removed for ${email || uid}.`,
  };
}
