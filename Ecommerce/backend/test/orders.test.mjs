import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateIdempotencyKey,
  computeRequestFingerprint,
} from '../dist/routes/orders.js';
import { buildNotificationMessage } from '../dist/notifications.js';

test('Order Service 1: validateIdempotencyKey enforces length and character set constraints', () => {
  assert.equal(validateIdempotencyKey('idemp_abc_12345'), 'idemp_abc_12345');
  assert.equal(validateIdempotencyKey('order:key:2026-10-25'), 'order:key:2026-10-25');

  assert.throws(() => validateIdempotencyKey('short'), /between 8 and 128 characters/);
  assert.throws(() => validateIdempotencyKey('has spaces in key 123'), /invalid characters/);
  assert.throws(() => validateIdempotencyKey(12345), /must be a string/);
});

test('Order Service 2: computeRequestFingerprint produces identical deterministic hash for matching payloads', () => {
  const hash1 = computeRequestFingerprint(
    'user_123',
    [
      { productId: 'prod_b', quantity: 2 },
      { productId: 'prod_a', quantity: 1 },
    ],
    { fullName: 'Akash Prabhu', phone: '9876543210' },
    'click_and_collect'
  );

  // Differently sorted items produce the exact same fingerprint due to internal sorting
  const hash2 = computeRequestFingerprint(
    'user_123',
    [
      { productId: 'prod_a', quantity: 1 },
      { productId: 'prod_b', quantity: 2 },
    ],
    { fullName: 'Akash Prabhu', phone: '9876543210' },
    'click_and_collect'
  );

  assert.equal(hash1, hash2, 'Item order must not affect deterministic fingerprint');

  // Modified quantity produces a distinct fingerprint
  const hash3 = computeRequestFingerprint(
    'user_123',
    [
      { productId: 'prod_a', quantity: 2 },
      { productId: 'prod_b', quantity: 2 },
    ],
    { fullName: 'Akash Prabhu', phone: '9876543210' },
    'click_and_collect'
  );

  assert.notEqual(hash1, hash3, 'Fingerprint must change when quantity changes');
});

test('Notification Service: buildNotificationMessage formats status updates accurately and securely', () => {
  const placed = buildNotificationMessage({
    status: 'placed',
    orderId: 'order_1234567890',
    recipientName: 'Akash',
  });
  assert.match(placed.title, /Order Confirmed/);
  assert.match(placed.body, /#567890/);
  assert.match(placed.body, /Akash/);

  const ready = buildNotificationMessage({
    status: 'ready_for_pickup',
    orderId: 'order_1234567890',
  });
  assert.match(ready.title, /Ready for Collection/);
  assert.match(ready.body, /6-digit verification PIN/);

  const cancelled = buildNotificationMessage({
    status: 'cancelled',
    orderId: 'order_1234567890',
  });
  assert.match(cancelled.title, /Order Cancelled/);
  assert.match(cancelled.body, /has been cancelled/);
});
