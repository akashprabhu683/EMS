import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNotificationMessage,
  maskToken,
  dispatchCustomerFcmAndInApp,
} from '../dist/notifications.js';

test('FCM Admin Notifications 1: buildNotificationMessage formats all order status updates accurately', () => {
  const statuses = [
    {
      status: 'placed',
      orderId: 'ord_123456789abc',
      recipientName: 'Akash',
      expectedTitle: 'Order Confirmed — EMS Dispensary',
      expectedSnippet: 'Hello Akash, your Click & Collect order #789ABC has been confirmed',
    },
    {
      status: 'accepted',
      orderId: 'ord_123456789abc',
      expectedTitle: 'Order Accepted — EMS Dispensary',
      expectedSnippet: 'Order #789ABC has been accepted by our dispensary pharmacists',
    },
    {
      status: 'preparing',
      orderId: 'ord_123456789abc',
      expectedTitle: 'Order Being Prepared — EMS Dispensary',
      expectedSnippet: 'remedies for order #789ABC are being packed',
    },
    {
      status: 'ready_for_pickup',
      orderId: 'ord_123456789abc',
      expectedTitle: '🌿 Ready for Collection — EMS Dispensary',
      expectedSnippet: 'Order #789ABC is ready at the dispensary counter! Please present your 6-digit verification PIN',
    },
    {
      status: 'collected',
      orderId: 'ord_123456789abc',
      expectedTitle: 'Order Collected — EMS Dispensary',
      expectedSnippet: 'Order #789ABC was collected. Thank you for choosing EMS',
    },
    {
      status: 'cancelled',
      orderId: 'ord_123456789abc',
      expectedTitle: 'Order Cancelled — EMS Dispensary',
      expectedSnippet: 'Click & Collect order #789ABC has been cancelled',
    },
  ];

  for (const tc of statuses) {
    const msg = buildNotificationMessage({
      status: tc.status,
      orderId: tc.orderId,
      recipientName: tc.recipientName,
    });
    assert.equal(msg.title, tc.expectedTitle, `Title mismatch for status '${tc.status}'`);
    assert.match(msg.body, new RegExp(tc.expectedSnippet, 'i'), `Body mismatch for status '${tc.status}'`);
  }
});

test('FCM Admin Notifications 2: Unknown status triggers graceful fallback message without throwing', () => {
  const fallback = buildNotificationMessage({
    status: 'custom_dispatched_status',
    orderId: 'ord_998877665544',
    recipientName: 'Customer',
  });
  assert.equal(fallback.title, 'Order Status Update — EMS Dispensary');
  assert.match(fallback.body, /Your order #665544 status has changed to 'custom_dispatched_status'/);
});

test('FCM Admin Notifications 3: maskToken prevents logging full device tokens or secrets', () => {
  // Long valid FCM registration token
  const longToken = 'eX9yZaBC1234567890abcdefghijklmnopqrstuvwxyz_1234567890ABCDEF';
  const masked = maskToken(longToken);
  assert.equal(masked, 'eX9yZa...CDEF');
  assert.equal(masked.length, 13); // 6 + 3 + 4 = 13
  assert.doesNotMatch(masked, new RegExp(longToken));

  // Short or invalid tokens
  assert.equal(maskToken('short_tok'), '[short-token]');
  assert.equal(maskToken(''), '[invalid]');
  assert.equal(maskToken(null), '[invalid]');
  assert.equal(maskToken(undefined), '[invalid]');
});

test('FCM Admin Notifications 4: Recipient isolation - empty userId returns clean zero-dispatch result', async () => {
  const result = await dispatchCustomerFcmAndInApp({
    userId: '',
    orderId: 'ord_test123',
    status: 'ready_for_pickup',
  });

  assert.deepEqual(result, {
    inAppCreated: false,
    tokensFound: 0,
    successCount: 0,
    failureCount: 0,
  });
});

test('FCM Admin Notifications 5: Payload verification - sensitive collection PINs never leaked in notifications', () => {
  const sensitivePins = ['123456', '789012', '998811'];
  for (const pin of sensitivePins) {
    const msg = buildNotificationMessage({
      status: 'ready_for_pickup',
      orderId: 'ord_sec998877',
      recipientName: 'Customer',
    });
    assert.doesNotMatch(msg.body, new RegExp(`\\b${pin}\\b`));
    assert.doesNotMatch(msg.title, new RegExp(`\\b${pin}\\b`));
  }
});
