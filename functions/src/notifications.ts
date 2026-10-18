import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

export interface NotificationPayload {
  orderId: string;
  recipientName: string;
  recipientPhone: string;
  status: string;
  message: string;
}

/**
 * Builds standard customer SMS / WhatsApp message text.
 */
export function buildNotificationMessage(payload: {
  status: string;
  orderId: string;
  recipientName: string;
}): string {
  const shortId = payload.orderId.slice(-6).toUpperCase();
  const name = payload.recipientName || "Valued Customer";

  switch (payload.status) {
    case "placed":
      return `EMS Dispensary: Hello ${name}, your order #${shortId} has been received! Our pharmacist is preparing your herbal remedies. You will receive an alert once ready for collection.`;
    case "accepted":
      return `EMS Dispensary: Order #${shortId} accepted by the dispensary. Preparing your items now.`;
    case "preparing":
      return `EMS Dispensary: Order #${shortId} is currently being packed and labeled with dosage instructions.`;
    case "ready_for_pickup":
      return `EMS Dispensary: Order #${shortId} is READY FOR COLLECTION at the dispensary counter (Main Road Health Complex, Pin: 560001). Please show this message upon arrival.`;
    case "collected":
      return `EMS Dispensary: Order #${shortId} collected successfully. Thank you for choosing EMS for your natural wellness journey!`;
    case "cancelled":
      return `EMS Dispensary: Order #${shortId} has been cancelled. Please visit our website or contact support if you need assistance.`;
    default:
      return `EMS Dispensary: Update on order #${shortId} - status changed to ${payload.status}.`;
  }
}

/**
 * Dispatches the notification via external SMS / WhatsApp API if configured,
 * and saves an immutable audit record to orders/{orderId}/notifications.
 */
async function dispatchNotification(payload: NotificationPayload) {
  const { orderId, recipientPhone, recipientName, status, message } = payload;
  logger.info(`[SMS/WhatsApp] Dispatching '${status}' notification to ${recipientPhone} for order ${orderId}`);

  let dispatchResult = "simulated_logged";

  // Fast2SMS integration (India standard quick SMS)
  const fast2SmsKey = process.env.FAST2SMS_API_KEY;
  if (fast2SmsKey && recipientPhone) {
    try {
      // Clean phone number (strip +91 if present)
      const cleanPhone = recipientPhone.replace(/^\+91/, "").replace(/\D/g, "");
      if (cleanPhone.length === 10) {
        const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
          method: "POST",
          headers: {
            authorization: fast2SmsKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            route: "q",
            message: message,
            language: "english",
            flash: 0,
            numbers: cleanPhone,
          }),
        });
        if (response.ok) {
          dispatchResult = "fast2sms_sent";
          logger.info(`Fast2SMS sent successfully to ${cleanPhone}`);
        } else {
          dispatchResult = `fast2sms_failed_${response.status}`;
          logger.warn(`Fast2SMS failed with HTTP ${response.status}`);
        }
      }
    } catch (err) {
      logger.error("Fast2SMS dispatch error:", err);
      dispatchResult = "fast2sms_error";
    }
  }

  // Record audit document in subcollection orders/{orderId}/notifications
  try {
    const notifRef = db.collection("orders").doc(orderId).collection("notifications").doc();
    await notifRef.set({
      id: notifRef.id,
      orderId,
      recipientName,
      recipientPhone,
      status,
      message,
      dispatchResult,
      sentAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error(`Failed to record notification audit log for order ${orderId}:`, err);
  }
}

/**
 * Trigger: Sends 'Order Placed' notification immediately when order is created.
 */
export const onOrderCreatedNotification = onDocumentCreated("orders/{orderId}", async (event) => {
  const snap = event.data;
  if (!snap) return;

  const orderId = event.params.orderId;
  const data = snap.data();
  const phone = data.pickupContact?.phone || data.shippingAddress?.phone || "";
  const name = data.pickupContact?.fullName || data.shippingAddress?.name || "Customer";

  if (!phone) {
    logger.info(`onOrderCreatedNotification: No contact phone for order ${orderId}, skipping SMS.`);
    return;
  }

  const message = buildNotificationMessage({
    status: "placed",
    orderId,
    recipientName: name,
  });

  await dispatchNotification({
    orderId,
    recipientName: name,
    recipientPhone: phone,
    status: "placed",
    message,
  });
});

/**
 * Trigger: Sends alerts when order status changes (e.g. 'ready_for_pickup', 'collected', 'cancelled').
 */
export const onOrderStatusNotification = onDocumentUpdated("orders/{orderId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;
  if (before.orderStatus === after.orderStatus) return;

  const orderId = event.params.orderId;
  const newStatus = after.orderStatus;
  const phone = after.pickupContact?.phone || after.shippingAddress?.phone || "";
  const name = after.pickupContact?.fullName || after.shippingAddress?.name || "Customer";

  if (!phone) {
    logger.info(`onOrderStatusNotification: No phone number for order ${orderId}, skipping.`);
    return;
  }

  const message = buildNotificationMessage({
    status: newStatus,
    orderId,
    recipientName: name,
  });

  await dispatchNotification({
    orderId,
    recipientName: name,
    recipientPhone: phone,
    status: newStatus,
    message,
  });
});
