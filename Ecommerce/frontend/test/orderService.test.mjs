import test from 'node:test';
import assert from 'node:assert/strict';

// Pure logic mirror of normalizeFirebaseOrder from orderService.ts
function normalizeTestOrder(data, docId = 'ord-test-123') {
  const pickupLocation = data.pickupLocation || 'EMS Herbal Dispensary, Main Road Health Complex, Postal Code: 560001';
  const customerName = data.pickupContact?.fullName || data.shippingAddress?.fullName || 'Valued Customer';
  const customerPhone = data.pickupContact?.phone || data.shippingAddress?.phone || '';

  const statusTitleMap = {
    placed: 'Order Placed (Awaiting Acceptance)',
    accepted: 'Order Accepted by Dispensary',
    preparing: 'Remedies Being Prepared',
    ready_for_pickup: 'Ready for Collection at Shop',
    collected: 'Collected & Paid at Shop',
    cancelled: 'Order Cancelled',
  };

  const statusLabel = statusTitleMap[data.orderStatus] || String(data.orderStatus || 'Placed').toUpperCase();

  const estimatedDelivery = (() => {
    const s = String(data.orderStatus || '').toLowerCase();
    if (s === 'ready_for_pickup') return 'Ready for Collection NOW';
    if (s === 'collected' || s === 'delivered') return 'Collected ✓';
    if (s === 'cancelled') return 'Order Cancelled';
    if (s === 'accepted') return 'Accepted — Preparing soon';
    if (s === 'preparing') return 'Being Prepared now';
    if (s === 'placed') return 'Awaiting dispensary acceptance';
    return 'Awaiting dispensary acceptance';
  })();

  const timeline = Array.isArray(data.statusHistory) && data.statusHistory.length > 0
    ? data.statusHistory.map((h) => {
        const isPayment = h.eventType === 'PAYMENT_RECORDED' || h.paymentStatus === 'paid';
        const title = isPayment
          ? 'Payment Received (Counter)'
          : (statusTitleMap[h.status] || (h.status ? String(h.status).replace(/_/g, ' ').toUpperCase() : 'Order Update'));
        const description = h.note || (isPayment ? 'In-person payment confirmed received at dispensary counter.' : `Order status updated to ${h.status || 'current state'}`);
        return {
          title,
          completed: true,
          description,
        };
      })
    : [
        {
          title: 'Order Placed',
          completed: true,
          description: 'Order registered. Awaiting dispensary acceptance.',
        },
      ];

  return {
    id: docId,
    status: data.orderStatus || 'placed',
    statusLabel,
    pickupLocation,
    pickupCode: data.pickupCode ? String(data.pickupCode) : undefined,
    estimatedDelivery,
    timeline,
  };
}

test('Order Service 1: Estimated delivery for placed status is "Awaiting dispensary acceptance", not hardcoded hours', () => {
  const order = normalizeTestOrder({ orderStatus: 'placed' });
  assert.equal(order.estimatedDelivery, 'Awaiting dispensary acceptance');
});

test('Order Service 2: Estimated delivery for progression states', () => {
  assert.equal(normalizeTestOrder({ orderStatus: 'accepted' }).estimatedDelivery, 'Accepted — Preparing soon');
  assert.equal(normalizeTestOrder({ orderStatus: 'preparing' }).estimatedDelivery, 'Being Prepared now');
  assert.equal(normalizeTestOrder({ orderStatus: 'ready_for_pickup' }).estimatedDelivery, 'Ready for Collection NOW');
  assert.equal(normalizeTestOrder({ orderStatus: 'collected' }).estimatedDelivery, 'Collected ✓');
  assert.equal(normalizeTestOrder({ orderStatus: 'cancelled' }).estimatedDelivery, 'Order Cancelled');
});

test('Order Service 3: Timeline handles payment events without blank title or "updated to undefined"', () => {
  const order = normalizeTestOrder({
    orderStatus: 'placed',
    statusHistory: [
      {
        eventType: 'ORDER_STATUS_CHANGED',
        status: 'placed',
        note: 'Order placed by customer.',
      },
      {
        eventType: 'PAYMENT_RECORDED',
        paymentStatus: 'paid',
        // Note: status is intentionally undefined here, as payment does not alter fulfillment status
      },
    ],
  });

  assert.equal(order.timeline.length, 2);
  assert.equal(order.timeline[0].title, 'Order Placed (Awaiting Acceptance)');
  assert.equal(order.timeline[1].title, 'Payment Received (Counter)');
  assert.equal(order.timeline[1].description, 'In-person payment confirmed received at dispensary counter.');
  assert.equal(order.timeline[1].title.includes('undefined'), false);
  assert.equal(order.timeline[1].description.includes('undefined'), false);
});

test('Order Service 4: Default pickup location uses Postal Code: 560001 (not ambiguous Pin: 560001)', () => {
  const order = normalizeTestOrder({});
  assert.match(order.pickupLocation, /Postal Code: 560001/);
  assert.doesNotMatch(order.pickupLocation, /Pin:\s*560001/);
});
