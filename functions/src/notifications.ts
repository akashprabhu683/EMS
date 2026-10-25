import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { verifyAuditAdminCaller } from "./audit.js";

const db = new Proxy({} as admin.firestore.Firestore, {
  get(_target, prop) {
    return (admin.firestore() as any)[prop];
  },
});

/**
 * Standard Customer Notification Message Generator.
 * Sanitized: Never embeds raw sensitive authentication secrets or full PII in push bodies.
 */
export function buildNotificationMessage(payload: {
  status: string;
  orderId: string;
  recipientName?: string;
}): { title: string; body: string } {
  const shortId = payload.orderId.slice(-6).toUpperCase();
  const name = payload.recipientName || "Valued Customer";

  switch (payload.status) {
    case "placed":
      return {
        title: "Order Confirmed — EMS Dispensary",
        body: `Hello ${name}, your Click & Collect order #${shortId} has been confirmed. We will prepare your herbal remedies shortly.`,
      };
    case "accepted":
      return {
        title: "Order Accepted — EMS Dispensary",
        body: `Order #${shortId} has been accepted by our dispensary pharmacists.`,
      };
    case "preparing":
      return {
        title: "Order Being Prepared — EMS Dispensary",
        body: `Your remedies for order #${shortId} are being packed and verified.`,
      };
    case "ready_for_pickup":
      return {
        title: "🌿 Ready for Collection — EMS Dispensary",
        body: `Order #${shortId} is ready at the dispensary counter! Please present your 6-digit verification PIN upon collection.`,
      };
    case "collected":
      return {
        title: "Order Collected — EMS Dispensary",
        body: `Order #${shortId} was collected. Thank you for choosing EMS for your herbal wellness!`,
      };
    case "cancelled":
      return {
        title: "Order Cancelled — EMS Dispensary",
        body: `Click & Collect order #${shortId} has been cancelled. Please visit our website or dispensary if you need assistance.`,
      };
    default:
      return {
        title: "Order Status Update — EMS Dispensary",
        body: `Your order #${shortId} status has changed to '${payload.status}'.`,
      };
  }
}

/**
 * Dispatches FCM push notifications to registered customer devices.
 * Also persists in-app notification in /users/{uid}/notifications as reliable web fallback.
 */
async function dispatchCustomerFcmAndInApp(params: {
  userId: string;
  orderId: string;
  status: string;
  recipientName?: string;
}) {
  const { userId, orderId, status, recipientName } = params;
  if (!userId) return;

  const { title, body } = buildNotificationMessage({ status, orderId, recipientName });
  const now = FieldValue.serverTimestamp();

  // 1. In-App Notification (Authoritative fallback for website and mobile users alike)
  try {
    const inAppRef = db.collection("users").doc(userId).collection("notifications").doc();
    await inAppRef.set({
      id: inAppRef.id,
      userId,
      orderId,
      status,
      title,
      body,
      read: false,
      createdAt: now,
    });
  } catch (inAppErr) {
    logger.warn(`Failed to store in-app notification for user ${userId}:`, inAppErr);
  }

  // 2. Fetch registered FCM tokens for user
  try {
    const tokensSnap = await db.collection("users").doc(userId).collection("fcm_tokens").get();
    if (tokensSnap.empty) {
      logger.info(`No active FCM device tokens registered for customer ${userId}`);
      return;
    }

    const tokens: string[] = [];
    tokensSnap.forEach((doc) => {
      const data = doc.data();
      if (data && typeof data.token === "string" && data.token.trim()) {
        tokens.push(data.token.trim());
      }
    });

    if (tokens.length === 0) return;

    // Send multicast push
    const messaging = admin.messaging();
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title,
        body,
      },
      data: {
        orderId,
        status,
        type: "order_update",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
    });

    logger.info(`[FCM Customer] Order ${orderId} (${status}): ${response.successCount} sent, ${response.failureCount} failed`);

    // Clean up invalid or stale tokens
    const staleDocs: FirebaseFirestore.DocumentReference[] = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        const errCode = resp.error.code;
        if (
          errCode === "messaging/registration-token-not-registered" ||
          errCode === "messaging/invalid-registration-token"
        ) {
          staleDocs.push(tokensSnap.docs[idx].ref);
        }
      }
    });

    if (staleDocs.length > 0) {
      const batch = db.batch();
      staleDocs.forEach((ref) => batch.delete(ref));
      await batch.commit();
      logger.info(`Cleaned up ${staleDocs.length} stale FCM tokens for user ${userId}`);
    }
  } catch (fcmErr) {
    logger.warn(`FCM dispatch error for customer ${userId}:`, fcmErr);
  }
}

/**
 * Dispatches FCM push notifications to all authorized dispensary administrators.
 */
async function dispatchAdminFcmAndInApp(params: {
  title: string;
  body: string;
  orderId?: string;
  type: string;
}) {
  const { title, body, orderId, type } = params;

  // 1. Store in /admin_notifications for admin dashboard stream
  try {
    const adminNotifRef = db.collection("admin_notifications").doc();
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
    logger.warn("Failed to store admin in-app notification:", err);
  }

  // 2. Collect all active admin tokens
  try {
    const adminSnaps = await db.collection("admins").get();
    if (adminSnaps.empty) return;

    const allTokens: { token: string; ref: FirebaseFirestore.DocumentReference }[] = [];
    for (const aDoc of adminSnaps.docs) {
      const tSnaps = await aDoc.ref.collection("fcm_tokens").get();
      tSnaps.forEach((t) => {
        const d = t.data();
        if (d && typeof d.token === "string" && d.token.trim()) {
          allTokens.push({ token: d.token.trim(), ref: t.ref });
        }
      });
    }

    if (allTokens.length === 0) return;

    const messaging = admin.messaging();
    const tokenStrings = allTokens.map((t) => t.token);

    const response = await messaging.sendEachForMulticast({
      tokens: tokenStrings,
      notification: {
        title,
        body,
      },
      data: {
        orderId: orderId || "",
        type,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
    });

    logger.info(`[FCM Admin] Alert '${type}': ${response.successCount} sent, ${response.failureCount} failed`);

    // Clean up invalid admin tokens
    const staleRefs: FirebaseFirestore.DocumentReference[] = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        const errCode = resp.error.code;
        if (
          errCode === "messaging/registration-token-not-registered" ||
          errCode === "messaging/invalid-registration-token"
        ) {
          staleRefs.push(allTokens[idx].ref);
        }
      }
    });

    if (staleRefs.length > 0) {
      const batch = db.batch();
      staleRefs.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  } catch (err) {
    logger.warn("Admin FCM dispatch error:", err);
  }
}

/**
 * Trigger: On Order Created
 * 1. Alerts customer via FCM & In-App notification of placement.
 * 2. Alerts administrators via FCM & Admin Notification of new order.
 * Note: Customer order emails and unapproved SMS are disabled per policy.
 */
export const onOrderCreatedNotification = onDocumentCreated("orders/{orderId}", async (event) => {
  const snap = event.data;
  if (!snap) return;

  const orderId = event.params.orderId;
  const data = snap.data();
  const userId = data.userId;
  const name = data.pickupContact?.fullName || data.shippingAddress?.name || "Customer";
  const shortId = orderId.slice(-6).toUpperCase();

  // 1. Customer Notification (FCM + In-App)
  if (userId) {
    await dispatchCustomerFcmAndInApp({
      userId,
      orderId,
      status: "placed",
      recipientName: name,
    });
  }

  // 2. Admin Operational Notification (FCM + Admin In-App)
  const totalRupees = (Number(data.total || data.subtotal || 0) / 100).toFixed(0);
  await dispatchAdminFcmAndInApp({
    title: `New Order #${shortId} (₹${totalRupees})`,
    body: `Click & Collect order placed by ${name}. Awaiting dispensary acceptance.`,
    orderId,
    type: "new_order",
  });
});

/**
 * Trigger: On Order Status Updated
 * Alerts customer via FCM & In-App whenever order status changes.
 */
export const onOrderStatusNotification = onDocumentUpdated("orders/{orderId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;
  if (before.orderStatus === after.orderStatus) return;

  const orderId = event.params.orderId;
  const newStatus = after.orderStatus;
  const userId = after.userId;
  const name = after.pickupContact?.fullName || after.shippingAddress?.name || "Customer";

  if (userId) {
    await dispatchCustomerFcmAndInApp({
      userId,
      orderId,
      status: newStatus,
      recipientName: name,
    });
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   CALLABLES: FCM DEVICE TOKEN REGISTRATION & LOGOUT CLEANUP
   ═══════════════════════════════════════════════════════════════════════ */

export interface RegisterFcmTokenRequestData {
  token: string;
  platform?: "android" | "web" | "ios";
}

/**
 * Registers an FCM device token against the authenticated customer or admin.
 */
export const registerFcmToken = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<RegisterFcmTokenRequestData>) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError("unauthenticated", "Authentication required to register device token.");
    }

    const { token, platform = "android" } = request.data || {};
    if (!token || typeof token !== "string" || token.trim().length < 10) {
      throw new HttpsError("invalid-argument", "A valid FCM registration token is required.");
    }

    const cleanToken = token.trim();
    const uid = request.auth.uid;
    const now = FieldValue.serverTimestamp();

    // Verify whether the caller possesses active administrator privileges
    // (includes real-time /admin_revocations check and verified email requirements)
    const email = request.auth.token.email;
    const emailVerified = Boolean(request.auth.token.email_verified);
    const hasAdminClaim = Boolean(request.auth.token.admin);
    const adminStatus = await verifyAuditAdminCaller(db, uid, email, hasAdminClaim, emailVerified);
    const isAdmin = adminStatus.isAdmin;

    // Save in user profile tokens
    const userTokenRef = db.collection("users").doc(uid).collection("fcm_tokens").doc(cleanToken);
    await userTokenRef.set({
      token: cleanToken,
      platform,
      updatedAt: now,
      createdAt: now,
    }, { merge: true });

    // If active administrator, also register in admins collection.
    // Otherwise, proactively clean up any lingering admin token document for this token.
    const adminTokenRef = db.collection("admins").doc(uid).collection("fcm_tokens").doc(cleanToken);
    if (isAdmin) {
      await adminTokenRef.set({
        token: cleanToken,
        platform,
        updatedAt: now,
        createdAt: now,
      }, { merge: true });
    } else {
      await adminTokenRef.delete().catch(() => {});
    }

    return { success: true, registered: true };
  }
);

/**
 * Unregisters an FCM device token upon logout.
 */
export const unregisterFcmToken = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<{ token: string }>) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError("unauthenticated", "Authentication required to unregister device token.");
    }

    const token = request.data?.token;
    if (!token || typeof token !== "string") {
      throw new HttpsError("invalid-argument", "Token is required.");
    }

    const cleanToken = token.trim();
    const uid = request.auth.uid;

    const userTokenRef = db.collection("users").doc(uid).collection("fcm_tokens").doc(cleanToken);
    const adminTokenRef = db.collection("admins").doc(uid).collection("fcm_tokens").doc(cleanToken);

    await Promise.all([
      userTokenRef.delete().catch(() => {}),
      adminTokenRef.delete().catch(() => {}),
    ]);

    return { success: true, unregistered: true };
  }
);
