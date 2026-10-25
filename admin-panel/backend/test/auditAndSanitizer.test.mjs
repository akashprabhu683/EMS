import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFirestorePayload } from '../dist/routes/admin.js';

test('Admin Backend Sanitizer 1: cleanFirestorePayload removes nested undefined fields', () => {
  const payload = {
    action: 'PAYMENT_RECORDED',
    actor: {
      uid: 'admin_123',
      email: undefined,
      role: 'admin',
    },
    target: {
      collection: 'orders',
      id: 'ord_456',
    },
    metadata: {
      totalPaise: 50000,
      confirmedBy: 'admin_123',
      note: undefined,
    },
    items: [
      { id: '1', note: undefined, qty: 1 },
      { id: '2', selectedColor: null, selectedSize: undefined },
    ],
  };

  const cleaned = cleanFirestorePayload(payload);

  assert.equal('email' in cleaned.actor, false);
  assert.equal(cleaned.actor.uid, 'admin_123');
  assert.equal('note' in cleaned.metadata, false);
  assert.equal(cleaned.metadata.totalPaise, 50000);
  assert.equal('note' in cleaned.items[0], false);
  assert.equal(cleaned.items[0].qty, 1);
  assert.equal(cleaned.items[1].selectedColor, null);
  assert.equal('selectedSize' in cleaned.items[1], false);
});

test('Admin Backend Sanitizer 2: cleanFirestorePayload preserves falsy values and Date objects', () => {
  const date = new Date();
  const payload = {
    zero: 0,
    empty: '',
    boolFalse: false,
    nullVal: null,
    dateVal: date,
  };

  const cleaned = cleanFirestorePayload(payload);

  assert.equal(cleaned.zero, 0);
  assert.equal(cleaned.empty, '');
  assert.equal(cleaned.boolFalse, false);
  assert.equal(cleaned.nullVal, null);
  assert.equal(cleaned.dateVal, date);
});
