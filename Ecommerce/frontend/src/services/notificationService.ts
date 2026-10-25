import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from '../firebase';

export interface InAppNotification {
  id: string;
  orderId?: string;
  title: string;
  body: string;
  status?: string;
  read: boolean;
  createdAt?: string;
}

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
      console.warn('[NotificationService] Error querying EMSAndroid bridge:', err);
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
let lastRegisteredCustomerToken: string | null = null;
let lastRegisteredCustomerUid: string | null = null;

/**
 * Listens in real-time to the authenticated user's in-app notification feed.
 * Authoritative fallback for website users who do not have the native Android APK.
 */
export function subscribeUserNotifications(
  uid: string,
  onUpdate: (notifications: InAppNotification[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!uid) {
    onUpdate([]);
    return () => {};
  }

  try {
    const notifsRef = collection(db, 'users', uid, 'notifications');
    const q = query(notifsRef, orderBy('createdAt', 'desc'), limit(20));

    return onSnapshot(
      q,
      (snapshot) => {
        const notifs: InAppNotification[] = snapshot.docs.map((d) => {
          const data = d.data();
          let createdAtStr = new Date().toISOString();
          if (data.createdAt?.toDate) {
            createdAtStr = data.createdAt.toDate().toISOString();
          } else if (typeof data.createdAt === 'string') {
            createdAtStr = data.createdAt;
          }
          return {
            id: d.id,
            orderId: data.orderId,
            title: data.title || 'Dispensary Order Update',
            body: data.body || '',
            status: data.status,
            read: Boolean(data.read),
            createdAt: createdAtStr,
          };
        });
        onUpdate(notifs);
      },
      (err) => {
        console.warn('[NotificationService] In-app stream error:', err);
        if (onError) onError(err);
      }
    );
  } catch (err: any) {
    console.warn('[NotificationService] Subscription setup failed:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Marks an in-app notification as read.
 */
export async function markNotificationAsRead(uid: string, notifId: string): Promise<void> {
  if (!uid || !notifId) return;
  try {
    const ref = doc(db, 'users', uid, 'notifications', notifId);
    await updateDoc(ref, { read: true });
  } catch (err) {
    console.warn('[NotificationService] Could not mark notification read:', err);
  }
}

/**
 * Registers an FCM device token for the current customer.
 * Uses authoritative registerFcmToken Cloud Function with direct Firestore fallback.
 */
export async function registerDeviceToken(
  uid: string,
  token: string,
  platform: 'android' | 'web' = 'android'
): Promise<void> {
  if (!uid || !token || token.trim().length < 10) return;
  const cleanToken = token.trim();

  // Deduplication check: do not re-register the same token for the same user in current session
  if (lastRegisteredCustomerToken === cleanToken && lastRegisteredCustomerUid === uid) {
    return;
  }

  try {
    // 1. Direct Firestore write (instantaneous, permitted by production security rules)
    const tokenRef = doc(db, 'users', uid, 'fcm_tokens', cleanToken);
    await setDoc(tokenRef, {
      token: cleanToken,
      platform,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true });
    lastRegisteredCustomerToken = cleanToken;
    lastRegisteredCustomerUid = uid;
  } catch (docErr) {
    console.warn('[NotificationService] Direct Firestore registration note, trying callable fallback:', docErr);
    // 2. Fallback: Cloud Function callable if deployed
    try {
      const registerFn = httpsCallable<{ token: string; platform: string }, { success: boolean }>(
        functions,
        'registerFcmToken'
      );
      await registerFn({ token: cleanToken, platform });
      lastRegisteredCustomerToken = cleanToken;
      lastRegisteredCustomerUid = uid;
    } catch (callableErr) {
      console.warn('[NotificationService] registerFcmToken callable also unavailable:', callableErr);
    }
  }
}

/**
 * Removes an FCM token upon sign-out to prevent stale or unauthorized alerts.
 */
export async function unregisterDeviceToken(uid: string, token: string): Promise<void> {
  if (!token) return;
  const cleanToken = token.trim();

  lastRegisteredCustomerToken = null;
  lastRegisteredCustomerUid = null;

  try {
    // 1. Direct Firestore deletion
    if (uid) {
      const tokenRef = doc(db, 'users', uid, 'fcm_tokens', cleanToken);
      await deleteDoc(tokenRef);
    }
  } catch (docErr) {
    console.warn('[NotificationService] Direct Firestore token deletion note, trying callable fallback:', docErr);
    // 2. Fallback: Cloud Function callable
    try {
      const unregisterFn = httpsCallable<{ token: string }, { success: boolean }>(
        functions,
        'unregisterFcmToken'
      );
      await unregisterFn({ token: cleanToken });
    } catch (callableErr) {
      console.warn('[NotificationService] unregisterFcmToken callable also unavailable:', callableErr);
    }
  }
}
