import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

/**
 * Safely queries the native Android wrapper for the cached FCM token.
 * Checks both the global window property and the secured EMSAndroid JS bridge.
 */
export function getNativeFcmToken(): string | null {
  if (typeof window === 'undefined') return null;
  const win = window as any;
  if (typeof win.EMS_FCM_TOKEN === 'string' && win.EMS_FCM_TOKEN.trim().length >= 10) {
    return win.EMS_FCM_TOKEN.trim();
  }
  if (win.EMSAndroid && typeof win.EMSAndroid.getFcmToken === 'function') {
    try {
      const token = win.EMSAndroid.getFcmToken();
      if (typeof token === 'string' && token.trim().length >= 10) {
        return token.trim();
      }
    } catch (err) {
      console.warn('[AdminNotificationService] Error querying EMSAndroid bridge:', err);
    }
  }
  return null;
}

/**
 * Attaches a listener for asynchronous FCM token delivery from the native Android app.
 */
export function setupFcmTokenListener(onToken: (token: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  // Check immediately if already present
  const immediateToken = getNativeFcmToken();
  if (immediateToken) {
    onToken(immediateToken);
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ token?: string }>;
    const token = customEvent.detail?.token || (window as any).EMS_FCM_TOKEN;
    if (typeof token === 'string' && token.trim().length >= 10) {
      onToken(token.trim());
    }
  };

  window.addEventListener('ems_fcm_token', handler);
  return () => {
    window.removeEventListener('ems_fcm_token', handler);
  };
}

// In-memory deduplication cache to prevent repeated network calls on re-renders
let lastRegisteredAdminToken: string | null = null;
let lastRegisteredAdminUid: string | null = null;

/**
 * Registers an FCM device token for the current administrator.
 * Uses authoritative registerFcmToken Cloud Function with direct Firestore fallback to /admins/{uid}/fcm_tokens.
 */
export async function registerAdminDeviceToken(
  uid: string,
  token: string,
  platform: 'android' | 'web' = 'android'
): Promise<void> {
  if (!uid || !token || token.trim().length < 10) return;
  const cleanToken = token.trim();

  // Deduplication check: do not re-register the same token for the same user in current session
  if (lastRegisteredAdminToken === cleanToken && lastRegisteredAdminUid === uid) {
    return;
  }

  try {
    // 1. Direct Firestore write (instantaneous, permitted by production security rules for authenticated admins)
    const adminTokenRef = doc(db, 'admins', uid, 'fcm_tokens', cleanToken);
    await setDoc(adminTokenRef, {
      token: cleanToken,
      platform,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true });
    lastRegisteredAdminToken = cleanToken;
    lastRegisteredAdminUid = uid;
  } catch (docErr) {
    console.warn('[AdminNotificationService] Direct admin token setDoc note, trying callable fallback:', docErr);
    // 2. Fallback: Cloud Function callable if deployed
    try {
      const registerFn = httpsCallable<{ token: string; platform: string }, { success: boolean }>(
        functions,
        'registerFcmToken'
      );
      await registerFn({ token: cleanToken, platform });
      lastRegisteredAdminToken = cleanToken;
      lastRegisteredAdminUid = uid;
    } catch (callableErr) {
      console.warn('[AdminNotificationService] registerFcmToken callable also unavailable:', callableErr);
    }
  }
}

/**
 * Removes an FCM token upon sign-out to prevent stale or unauthorized alerts.
 */
export async function unregisterAdminDeviceToken(uid: string, token: string): Promise<void> {
  if (!token) return;
  const cleanToken = token.trim();

  lastRegisteredAdminToken = null;
  lastRegisteredAdminUid = null;

  try {
    // 1. Direct Firestore deletion
    if (uid) {
      const adminTokenRef = doc(db, 'admins', uid, 'fcm_tokens', cleanToken);
      await deleteDoc(adminTokenRef);
    }
  } catch (docErr) {
    console.warn('[AdminNotificationService] Direct admin token deleteDoc note, trying callable fallback:', docErr);
    // 2. Fallback: Cloud Function callable
    try {
      const unregisterFn = httpsCallable<{ token: string }, { success: boolean }>(
        functions,
        'unregisterFcmToken'
      );
      await unregisterFn({ token: cleanToken });
    } catch (callableErr) {
      console.warn('[AdminNotificationService] unregisterFcmToken callable also unavailable:', callableErr);
    }
  }
}
