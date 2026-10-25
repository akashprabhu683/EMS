import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, getAdminMessaging } from './firebaseAdmin.js';

export function buildNotificationMessage(payload: {
  status: string;
  orderId: string;
  recipientName?: string;
}): { title: string; body: string } {
  const shortId = payload.orderId.slice(-6).toUpperCase();
  const name = payload.recipientName || 'Valued Customer';

  switch (payload.status) {
    case 'placed':
      return {
        title: 'Order Confirmed — EMS Dispensary',
        body: `Hello ${name}, your Click & Collect order #${shortId} has been confirmed. We will prepare your herbal remedies shortly.`,
      };
    case 'accepted':
      return {
        title: 'Order Accepted — EMS Dispensary',
        body: `Order #${shortId} has been accepted by our dispensary pharmacists.`,
      };
    case 'preparing':
      return {
        title: 'Order Being Prepared — EMS Dispensary',
        body: `Your remedies for order #${shortId} are being packed and verified.`,
      };
    case 'ready_for_pickup':
      return {
        title: '🌿 Ready for Collection — EMS Dispensary',
        body: `Order #${shortId} is ready at the dispensary counter! Please present your 6-digit verification PIN upon collection.`,
      };
    case 'collected':
      return {
        title: 'Order Collected — EMS Dispensary',
        body: `Order #${shortId} was collected. Thank you for choosing EMS for your herbal wellness!`,
      };
    case 'cancelled':
      return {
        title: 'Order Cancelled — EMS Dispensary',
        body: `Click & Collect order #${shortId} has been cancelled. Please visit our website or dispensary if you need assistance.`,
      };
    default:
      return {
        title: 'Order Status Update — EMS Dispensary',
        body: `Your order #${shortId} status has changed to '${payload.status}'.`,
      };
  }
}

export interface FcmDispatchResult {
  inAppCreated: boolean;
  tokensFound: number;
  successCount: number;
  failureCount: number;
  errors?: Array<{ code?: string; message: string }>;
}

export function maskToken(token: string): string {
  if (!token || typeof token !== 'string') return '[invalid]';
  const trimmed = token.trim();
  if (trimmed.length <= 12) return '[short-token]';
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

/**
 * Dispatches customer in-app notifications and FCM push notifications without requiring Cloud Functions.
 * Returns diagnostic send results without throwing unhandled exceptions.
 */
export async function dispatchCustomerFcmAndInApp(params: {
  userId: string;
  orderId: string;
  status: string;
  recipientName?: string;
}): Promise<FcmDispatchResult> {
  const { userId, orderId, status, recipientName } = params;
  if (!userId) {
    return { inAppCreated: false, tokensFound: 0, successCount: 0, failureCount: 0 };
  }

  const { title, body } = buildNotificationMessage({ status, orderId, recipientName });
  let inAppCreated = false;

  // 1. In-App Notification (Always reliable in Firestore)
  try {
    const inAppRef = adminDb.collection('users').doc(userId).collection('notifications').doc();
    await inAppRef.set({
      id: inAppRef.id,
      userId,
      orderId,
      status,
      title,
      body,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    inAppCreated = true;
    console.log(`[Notifications] In-app notification created for customer ${userId} (Order #${orderId.slice(-6).toUpperCase()}, status: ${status})`);
  } catch (inAppErr) {
    console.warn(`[Notifications] In-app notification store failed for ${userId}:`, inAppErr);
  }

  // 2. FCM Push Notification
  try {
    const tokensSnap = await adminDb.collection('users').doc(userId).collection('fcm_tokens').get();
    if (tokensSnap.empty) {
      console.log(`[Notifications] No registered FCM tokens found for customer ${userId}. Push notification skipped.`);
      return { inAppCreated, tokensFound: 0, successCount: 0, failureCount: 0 };
    }

    const tokens: string[] = [];
    tokensSnap.forEach((doc) => {
      const data = doc.data();
      if (data && typeof data.token === 'string' && data.token.trim().length >= 10) {
        tokens.push(data.token.trim());
      }
    });

    if (tokens.length === 0) {
      console.log(`[Notifications] Customer ${userId} has 0 valid FCM token strings in ${tokensSnap.size} document(s).`);
      return { inAppCreated, tokensFound: 0, successCount: 0, failureCount: 0 };
    }

    const messaging = getAdminMessaging();
    if (!messaging) {
      console.warn(`[Notifications] Firebase Messaging instance unavailable. Check FIREBASE_SERVICE_ACCOUNT_KEY on Render.`);
      return {
        inAppCreated,
        tokensFound: tokens.length,
        successCount: 0,
        failureCount: tokens.length,
        errors: [{ message: 'Firebase Messaging instance unavailable' }],
      };
    }

    console.log(`[Notifications] Dispatching FCM multicast to ${tokens.length} device token(s) for customer ${userId}...`);

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: {
        title,
        body,
        orderId,
        status,
        type: 'order_update',
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'order_updates',
          priority: 'high',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
    });

    console.log(`[Notifications] FCM send complete for customer ${userId} (Order #${orderId.slice(-6).toUpperCase()}): ${response.successCount} succeeded, ${response.failureCount} failed out of ${tokens.length} token(s).`);

    const errors: Array<{ code?: string; message: string }> = [];
    const staleDocs: FirebaseFirestore.DocumentReference[] = [];

    response.responses.forEach((resp, idx) => {
      const masked = maskToken(tokens[idx]);
      if (resp.success) {
        console.log(`[Notifications] Token [${idx}] (${masked}): accepted by FCM. messageId=${resp.messageId}`);
      } else {
        const code = resp.error?.code || 'unknown_error';
        const message = resp.error?.message || 'FCM dispatch failed';
        console.warn(`[Notifications] Token [${idx}] (${masked}) rejected: code=${code}, message=${message}`);
        errors.push({ code, message });

        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          staleDocs.push(tokensSnap.docs[idx].ref);
        }
      }
    });

    // Cleanup stale tokens
    if (staleDocs.length > 0) {
      const batch = adminDb.batch();
      staleDocs.forEach((ref) => batch.delete(ref));
      await batch.commit();
      console.log(`[Notifications] Removed ${staleDocs.length} stale/unregistered token document(s) from Firestore.`);
    }

    return {
      inAppCreated,
      tokensFound: tokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (fcmErr: any) {
    console.error(`[Notifications] FCM dispatch exception for customer ${userId}: message=${fcmErr?.message}, code=${fcmErr?.code}`, fcmErr);
    return {
      inAppCreated,
      tokensFound: 0,
      successCount: 0,
      failureCount: 1,
      errors: [{ code: fcmErr?.code || 'fcm_exception', message: fcmErr?.message || String(fcmErr) }],
    };
  }
}

/**
 * Dispatches operational in-app and FCM push notifications to all authorized administrators.
 */
export async function dispatchAdminFcmAndInApp(params: {
  title: string;
  body: string;
  orderId?: string;
  type: string;
}): Promise<void> {
  const { title, body, orderId, type } = params;

  // 1. In-App notification in /admin_notifications
  try {
    const adminNotifRef = adminDb.collection('admin_notifications').doc();
    await adminNotifRef.set({
      id: adminNotifRef.id,
      title,
      body,
      orderId: orderId || null,
      type,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn('[Notifications] Failed to store admin in-app notification:', err);
  }

  // 2. Fetch admin FCM device tokens
  try {
    const adminSnaps = await adminDb.collection('admins').get();
    if (adminSnaps.empty) return;

    const allTokens: { token: string; ref: FirebaseFirestore.DocumentReference }[] = [];
    for (const aDoc of adminSnaps.docs) {
      const tSnaps = await aDoc.ref.collection('fcm_tokens').get();
      tSnaps.forEach((t) => {
        const d = t.data();
        if (d && typeof d.token === 'string' && d.token.trim()) {
          allTokens.push({ token: d.token.trim(), ref: t.ref });
        }
      });
    }

    if (allTokens.length === 0) return;

    const messaging = getAdminMessaging();
    if (!messaging) return;

    const tokenStrings = allTokens.map((t) => t.token);
    const response = await messaging.sendEachForMulticast({
      tokens: tokenStrings,
      notification: { title, body },
      data: {
        title,
        body,
        orderId: orderId || '',
        type,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'dispensary_alerts',
          priority: 'high',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
    });

    const staleRefs: FirebaseFirestore.DocumentReference[] = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        const code = resp.error.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          staleRefs.push(allTokens[idx].ref);
        }
      }
    });

    if (staleRefs.length > 0) {
      const batch = adminDb.batch();
      staleRefs.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  } catch (err) {
    console.warn('[Notifications] Admin FCM dispatch error:', err);
  }
}
