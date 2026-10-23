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
import { db, auth } from '../firebase';

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
 * Registers an FCM device token for the current customer (used by Android wrapper or browser push).
 */
export async function registerDeviceToken(
  uid: string,
  token: string,
  platform: 'android' | 'web' = 'web'
): Promise<void> {
  if (!uid || !token) return;
  try {
    const tokenRef = doc(db, 'users', uid, 'fcm_tokens', token);
    await setDoc(tokenRef, {
      token,
      platform,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.warn('[NotificationService] Failed to register device token:', err);
  }
}

/**
 * Removes an FCM token upon sign-out to prevent stale or unauthorized alerts.
 */
export async function unregisterDeviceToken(uid: string, token: string): Promise<void> {
  if (!uid || !token) return;
  try {
    const tokenRef = doc(db, 'users', uid, 'fcm_tokens', token);
    await deleteDoc(tokenRef);
  } catch (err) {
    console.warn('[NotificationService] Failed to unregister device token:', err);
  }
}
