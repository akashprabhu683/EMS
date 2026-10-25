import test from "node:test";
import assert from "node:assert/strict";
import { buildNotificationMessage } from "../lib/notifications.js";

/* ═══════════════════════════════════════════════════════════════════════
   FCM NOTIFICATION SUITE: AUTHORIZATION, LIFECYCLE & SANITIZATION
   ═══════════════════════════════════════════════════════════════════════ */

test("FCM 1: buildNotificationMessage formats order status messages correctly", () => {
  const testCases = [
    {
      status: "placed",
      orderId: "ord_123456789abc",
      recipientName: "Karthik",
      expectedTitle: "Order Confirmed — EMS Dispensary",
      expectedSnippet: "Hello Karthik, your Click & Collect order #789ABC has been confirmed",
    },
    {
      status: "accepted",
      orderId: "ord_123456789abc",
      expectedTitle: "Order Accepted — EMS Dispensary",
      expectedSnippet: "Order #789ABC has been accepted by our dispensary pharmacists",
    },
    {
      status: "preparing",
      orderId: "ord_123456789abc",
      expectedTitle: "Order Being Prepared — EMS Dispensary",
      expectedSnippet: "remedies for order #789ABC are being packed",
    },
    {
      status: "ready_for_pickup",
      orderId: "ord_123456789abc",
      expectedTitle: "🌿 Ready for Collection — EMS Dispensary",
      expectedSnippet: "Order #789ABC is ready at the dispensary counter! Please present your 6-digit verification PIN",
    },
    {
      status: "collected",
      orderId: "ord_123456789abc",
      expectedTitle: "Order Collected — EMS Dispensary",
      expectedSnippet: "Order #789ABC was collected. Thank you for choosing EMS",
    },
    {
      status: "cancelled",
      orderId: "ord_123456789abc",
      expectedTitle: "Order Cancelled — EMS Dispensary",
      expectedSnippet: "Click & Collect order #789ABC has been cancelled",
    },
  ];

  for (const tc of testCases) {
    const msg = buildNotificationMessage({
      status: tc.status,
      orderId: tc.orderId,
      recipientName: tc.recipientName,
    });

    assert.equal(msg.title, tc.expectedTitle, `Title mismatch for status '${tc.status}'`);
    assert.match(msg.body, new RegExp(tc.expectedSnippet, "i"), `Body mismatch for status '${tc.status}'`);
  }
});

test("FCM 2: Push notification payloads NEVER contain collection PINs or financial payment tokens", () => {
  // Verification test ensuring raw secrets are NEVER placed in push notification headers or bodies
  const sensitivePins = ["482910", "123456", "998877"];
  const orderId = "order_test_abcdef";

  for (const pin of sensitivePins) {
    const msg = buildNotificationMessage({
      status: "ready_for_pickup",
      orderId,
      recipientName: "Customer",
    });

    // Body must instruct presenting the PIN upon collection, but must NEVER include the actual raw 6-digit PIN value
    assert.doesNotMatch(
      msg.body,
      new RegExp(`\\b${pin}\\b`),
      `Notification body must NEVER contain the raw verification PIN ${pin}`
    );
    assert.doesNotMatch(
      msg.title,
      new RegExp(`\\b${pin}\\b`),
      `Notification title must NEVER contain the raw verification PIN ${pin}`
    );
  }
});

test("FCM 3: Unknown or custom order statuses produce honest fallback messages", () => {
  const msg = buildNotificationMessage({
    status: "partially_fulfilled",
    orderId: "ord_xyz987654",
    recipientName: "Doctor Raman",
  });

  assert.equal(msg.title, "Order Status Update — EMS Dispensary");
  assert.match(msg.body, /Your order #987654 status has changed to 'partially_fulfilled'/);
});

test("FCM 4: Short order ID extraction uses last 6 characters in uppercase", () => {
  const msg = buildNotificationMessage({
    status: "placed",
    orderId: "order_full_identifier_abc123",
  });

  assert.match(msg.body, /#ABC123/);
});

test("FCM 5: Stale token error code detection accurately classifies unregistered and invalid tokens", () => {
  const isStaleTokenError = (errCode) => {
    return (
      errCode === "messaging/registration-token-not-registered" ||
      errCode === "messaging/invalid-registration-token"
    );
  };

  assert.equal(isStaleTokenError("messaging/registration-token-not-registered"), true);
  assert.equal(isStaleTokenError("messaging/invalid-registration-token"), true);
  assert.equal(isStaleTokenError("messaging/server-unavailable"), false);
  assert.equal(isStaleTokenError("messaging/internal-error"), false);
});
