import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  sendOrderPlacedEmail,
  sendOrderReadyForPickupEmail,
} from "./emailService.js";

const db = admin.firestore();

export interface NotificationPayload {
  orderId: string;
  recipientName: string;
  recipientPhone: string;
  status: string;
  message: string;
}

/**
 * Resolves user email from order data or Firebase Auth.
 */
async function resolveCustomerEmail(orderData: any): Promise<string | null> {
  if (orderData.pickupContact?.email && typeof orderData.pickupContact.email === "string") {
    return orderData.pickupContact.email.trim();
  }
  if (orderData.customerEmail && typeof orderData.customerEmail === "string") {
    return orderData.customerEmail.trim();
  }
  if (orderData.userId) {
    try {
      const user = await admin.auth().getUser(orderData.userId);
      if (user && user.email) return user.email;
    } catch {
      // User might be anonymous or not found
    }
  }
  return null;
}

/**
 * Builds standard customer notification message text.
 */
export function buildNotificationMessage(payload: {
  status: string;
  orderId: string;
  recipientName: string;
  pickupCode?: string;
}): string {
  const shortId = payload.orderId.slice(-6).toUpperCase();
  const name = payload.recipientName || "Valued Customer";
  const pinStr = payload.pickupCode ? ` (Verification PIN: ${payload.pickupCode})` : "";

  switch (payload.status) {
    case "placed":
      return `EMS Dispensary: Hello ${name}, your order #${shortId} has been placed! Our pharmacist is preparing your herbal remedies. You will receive an alert once ready for collection.`;
    case "accepted":
      return `EMS Dispensary: Order #${shortId} accepted by the dispensary. Preparing your items now.`;
    case "preparing":
      return `EMS Dispensary: Order #${shortId} is currently being packed and labeled with dosage instructions.`;
    case "ready_for_pickup":
      return `EMS Dispensary: Order #${shortId} is READY FOR COLLECTION${pinStr} at the dispensary counter (Main Road Health Complex, Pin: 560001). Please show your PIN upon arrival.`;
    case "collected":
      return `EMS Dispensary: Order #${shortId} collected successfully. Thank you for choosing EMS for your natural wellness journey!`;
    case "cancelled":
      return `EMS Dispensary: Order #${shortId} has been cancelled. Please visit our website or contact support if you need assistance.`;
    default:
      return `EMS Dispensary: Update on order #${shortId} - status changed to ${payload.status}.`;
  }
}

/**
 * Dispatches notification via external SMS / WhatsApp API if configured and approved,
 * and saves an immutable audit record to orders/{orderId}/notifications.
 */
async function dispatchNotification(payload: NotificationPayload) {
  const { orderId, recipientPhone, recipientName, status, message } = payload;
  logger.info(`[Notifications] Dispatching '${status}' notification to ${recipientPhone} for order ${orderId}`);

  let dispatchResult = "simulated_logged";

  // Fast2SMS integration (India standard quick SMS - requires approval & explicit key)
  const fast2SmsKey = process.env.FAST2SMS_API_KEY;
  if (fast2SmsKey && recipientPhone) {
    try {
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
  const pickupCode = data.pickupCode || "";
  const pickupLocation = data.pickupLocation || "EMS Herbal & Ayurvedic Dispensary, Main Road Health Complex";

  // 1. Transactional Email via Resend with Idempotency Protection
  if (!data.emailsSent?.placed) {
    const email = await resolveCustomerEmail(data);
    if (email) {
      try {
        await sendOrderPlacedEmail({
          toEmail: email,
          customerName: name,
          orderId,
          pickupCode,
          items: Array.isArray(data.items) ? data.items : [],
          totalPaise: Number(data.total || data.subtotal || 0),
          pickupLocation,
        });

        await db.collection("orders").doc(orderId).update({
          "emailsSent.placed": true,
          "emailsSent.placedAt": FieldValue.serverTimestamp(),
        });
      } catch (emailErr) {
        logger.error(`Failed to dispatch order placed email for ${orderId}:`, emailErr);
      }
    }
  }

  // 2. Mobile notification / audit record
  if (phone) {
    const message = buildNotificationMessage({
      status: "placed",
      orderId,
      recipientName: name,
      pickupCode,
    });

    await dispatchNotification({
      orderId,
      recipientName: name,
      recipientPhone: phone,
      status: "placed",
      message,
    });
  }
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
  const pickupCode = after.pickupCode || "";
  const pickupLocation = after.pickupLocation || "EMS Herbal & Ayurvedic Dispensary, Main Road Health Complex";

  // 1. Email notification for 'ready_for_pickup' with collection PIN and idempotency protection
  if (newStatus === "ready_for_pickup" && !after.emailsSent?.ready_for_pickup) {
    const email = await resolveCustomerEmail(after);
    if (email) {
      try {
        await sendOrderReadyForPickupEmail({
          toEmail: email,
          customerName: name,
          orderId,
          pickupCode,
          totalPaise: Number(after.total || 0),
          pickupLocation,
        });

        await db.collection("orders").doc(orderId).update({
          "emailsSent.ready_for_pickup": true,
          "emailsSent.ready_for_pickupAt": FieldValue.serverTimestamp(),
        });
      } catch (emailErr) {
        logger.error(`Failed to dispatch ready_for_pickup email for ${orderId}:`, emailErr);
      }
    }
  }

  // 2. Log and dispatch notification
  if (phone) {
    const message = buildNotificationMessage({
      status: newStatus,
      orderId,
      recipientName: name,
      pickupCode,
    });

    await dispatchNotification({
      orderId,
      recipientName: name,
      recipientPhone: phone,
      status: newStatus,
      message,
    });
  }
});

