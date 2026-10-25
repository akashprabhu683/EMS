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

/**
 * Dispatches customer in-app and FCM push alerts upon order status changes.
 */
export async function dispatchCustomerFcmAndInApp(params: {
  userId: string;
  orderId: string;
  status: string;
  recipientName?: string;
}): Promise<void> {
  const { userId, orderId, status, recipientName } = params;
  if (!userId) return;

  const { title, body } = buildNotificationMessage({ status, orderId, recipientName });

  // 1. In-App Notification in Firestore
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
  } catch (inAppErr) {
    console.warn(`[AdminNotifications] In-app notification store failed for ${userId}:`, inAppErr);
  }

  // 2. Multicast FCM Push Alert
  try {
    const tokensSnap = await adminDb.collection('users').doc(userId).collection('fcm_tokens').get();
    if (tokensSnap.empty) return;

    const tokens: string[] = [];
    tokensSnap.forEach((doc) => {
      const data = doc.data();
      if (data && typeof data.token === 'string' && data.token.trim()) {
        tokens.push(data.token.trim());
      }
    });

    if (tokens.length === 0) return;

    const messaging = getAdminMessaging();
    if (!messaging) return;

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

    // Cleanup stale tokens
    const staleDocs: FirebaseFirestore.DocumentReference[] = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        const code = resp.error.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          staleDocs.push(tokensSnap.docs[idx].ref);
        }
      }
    });

    if (staleDocs.length > 0) {
      const batch = adminDb.batch();
      staleDocs.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  } catch (fcmErr) {
    console.warn(`[AdminNotifications] FCM dispatch error for customer ${userId}:`, fcmErr);
  }
}
