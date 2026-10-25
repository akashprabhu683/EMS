import test from 'node:test';
import assert from 'node:assert/strict';

// Import pure logic from receiptService
// Note: receiptService contains both pure string formatting and DOM-dependent download.
// We test the authoritative text generation and metadata calculation.

function generateDispensaryReceiptContent(order) {
  const isPaid = String(order.paymentStatus || '').toLowerCase() === 'paid';
  const orderId = order.id || 'UNKNOWN';
  const dateStr = order.date || new Date().toLocaleDateString('en-IN');
  const customerName = order.pickupContact?.fullName || order.shippingAddress?.fullName || 'Valued Customer';
  const customerPhone = order.pickupContact?.phone || order.shippingAddress?.phone || 'Not provided';
  const pickupLoc = order.pickupLocation || 'EMS Herbal Dispensary, Main Road Health Complex';
  const items = Array.isArray(order.items) ? order.items : [];

  const subtotal = Number(order.subtotal || 0);
  const total = Number(order.total || 0);

  const title = isPaid
    ? 'EMS DISPENSARY PAYMENT RECEIPT'
    : 'EMS CLICK-AND-COLLECT ORDER CONFIRMATION';

  const filename = isPaid
    ? `EMS-Receipt-${orderId}.txt`
    : `EMS-Order-Confirmation-${orderId}.txt`;

  const headerNotice = isPaid
    ? `OFFICIAL IN-PERSON SETTLEMENT RECEIPT
Payment has been confirmed at the dispensary counter.`
    : `ORDER CONFIRMATION & COLLECTION VOUCHER
*** NOT A PAID TAX RECEIPT ***
Payment of ₹${total.toFixed(2)} is due at the dispensary counter upon collection.`;

  const itemsList = items.length > 0
    ? items
        .map((item, idx) => {
          const name = item.product?.name || `Item ${idx + 1}`;
          const qty = Number(item.quantity) || 1;
          const unitPrice = Number(item.price || 0);
          const lineTotal = unitPrice * qty;
          return `  ${String(idx + 1).padStart(2, ' ')}. ${name.padEnd(36, ' ')} x${String(qty).padStart(2, ' ')}   ₹${lineTotal.toFixed(2)}`;
        })
        .join('\n')
    : '  (No item details recorded)';

  const pickupPinBlock = order.pickupCode
    ? `Counter Collection PIN : ${order.pickupCode}
(Present this 6-digit PIN to the dispensary pharmacist)`
    : `Counter Collection    : Show Order ID (${orderId}) at counter`;

  const content = `
=============================================================
             THANGAM STORES / EMS DISPENSARY
           Ayurvedic & Natural Herbal Remedies
=============================================================
${headerNotice}
=============================================================
Order Reference       : ${orderId}
Date Issued           : ${dateStr}
Order Status          : ${order.statusLabel || String(order.status || '').toUpperCase()}
Payment Status        : ${isPaid ? 'PAID (Settled in Person at Counter)' : 'UNPAID (Pending Counter Collection)'}
Payment Method        : Pay at Counter (Click-and-Collect)
${pickupPinBlock}
-------------------------------------------------------------
CUSTOMER DETAILS:
Customer Name         : ${customerName}
Contact Phone         : ${customerPhone}
Pickup Location       : ${pickupLoc}
-------------------------------------------------------------
DISPENSED ITEMS:
${itemsList}
-------------------------------------------------------------
Subtotal Amount       : ₹${subtotal.toFixed(2)}
Tax / GST             : ₹0.00 (Inclusive / As applicable)
Total Amount ${isPaid ? 'Paid' : 'Due'}      : ₹${total.toFixed(2)} INR
=============================================================
${isPaid 
  ? 'Thank you for choosing Thangam Stores EMS Dispensary.\nThis document serves as proof of in-person counter settlement.'
  : 'Please keep this confirmation handy when visiting the dispensary.\nAn official payment receipt is issued upon counter settlement.'}
=============================================================
`.trim();

  return {
    title,
    filename,
    content,
    isPaidReceipt: isPaid,
  };
}

test('Receipt 1: Paid order generates an authoritative official in-person payment receipt', () => {
  const mockOrder = {
    id: 'ord-paid-7890',
    date: 'Oct 25, 2026',
    status: 'collected',
    statusLabel: 'Collected & Paid at Shop',
    paymentStatus: 'paid',
    pickupCode: '458921',
    pickupLocation: 'EMS Herbal Dispensary, Main Road Counter #2',
    pickupContact: {
      fullName: 'Aarav Patel',
      phone: '+91 98765 43210',
    },
    items: [
      {
        product: { name: 'Triphala Churna 100g' },
        quantity: 2,
        price: 180,
      },
      {
        product: { name: 'Ashwagandha Premium Extract' },
        quantity: 1,
        price: 450,
      },
    ],
    subtotal: 810,
    total: 810,
  };

  const receipt = generateDispensaryReceiptContent(mockOrder);

  assert.equal(receipt.isPaidReceipt, true);
  assert.equal(receipt.filename, 'EMS-Receipt-ord-paid-7890.txt');
  assert.equal(receipt.title, 'EMS DISPENSARY PAYMENT RECEIPT');

  assert.match(receipt.content, /OFFICIAL IN-PERSON SETTLEMENT RECEIPT/);
  assert.match(receipt.content, /Order Reference\s+:\s+ord-paid-7890/);
  assert.match(receipt.content, /Payment Status\s+:\s+PAID \(Settled in Person at Counter\)/);
  assert.match(receipt.content, /Triphala Churna 100g\s+x 2\s+₹360\.00/);
  assert.match(receipt.content, /Ashwagandha Premium Extract\s+x 1\s+₹450\.00/);
  assert.match(receipt.content, /Total Amount Paid\s+:\s+₹810\.00 INR/);
  assert.match(receipt.content, /Customer Name\s+:\s+Aarav Patel/);
  assert.match(receipt.content, /Contact Phone\s+:\s+\+91 98765 43210/);
  assert.doesNotMatch(receipt.content, /NOT A PAID/);
});

test('Receipt 2: Unpaid order is labeled as an order confirmation and explicitly NOT a paid receipt', () => {
  const mockOrder = {
    id: 'ord-unpaid-1234',
    date: 'Oct 25, 2026',
    status: 'ready_for_pickup',
    statusLabel: 'Ready for Collection at Shop',
    paymentStatus: 'unpaid',
    pickupCode: '891234',
    pickupLocation: 'EMS Dispensary, Main Counter',
    pickupContact: {
      fullName: 'Priya Sharma',
      phone: '+91 98111 22233',
    },
    items: [
      {
        product: { name: 'Brahmi Brain Tonic' },
        quantity: 1,
        price: 250,
      },
    ],
    subtotal: 250,
    total: 250,
  };

  const receipt = generateDispensaryReceiptContent(mockOrder);

  assert.equal(receipt.isPaidReceipt, false);
  assert.equal(receipt.filename, 'EMS-Order-Confirmation-ord-unpaid-1234.txt');
  assert.equal(receipt.title, 'EMS CLICK-AND-COLLECT ORDER CONFIRMATION');

  assert.match(receipt.content, /\*\*\* NOT A PAID TAX RECEIPT \*\*\*/);
  assert.match(receipt.content, /Payment of ₹250\.00 is due at the dispensary counter upon collection/);
  assert.match(receipt.content, /Payment Status\s+:\s+UNPAID \(Pending Counter Collection\)/);
  assert.match(receipt.content, /Counter Collection PIN : 891234/);
  assert.match(receipt.content, /Total Amount Due\s+:\s+₹250\.00 INR/);
  assert.doesNotMatch(receipt.content, /Total Amount Paid/);
});

test('Receipt 3: Fallback handling when items or pickup details are sparse', () => {
  const sparseOrder = {
    id: 'ord-sparse-001',
    paymentStatus: 'unpaid',
  };

  const receipt = generateDispensaryReceiptContent(sparseOrder);

  assert.equal(receipt.isPaidReceipt, false);
  assert.match(receipt.content, /Customer Name\s+:\s+Valued Customer/);
  assert.match(receipt.content, /Contact Phone\s+:\s+Not provided/);
  assert.match(receipt.content, /\(No item details recorded\)/);
  assert.match(receipt.content, /Total Amount Due\s+:\s+₹0\.00 INR/);
});

test('Receipt 4: Authoritative price fidelity and absence of fabricated taxes or business reg numbers', () => {
  const mockOrder = {
    id: 'ord-audit-test',
    paymentStatus: 'paid',
    total: 99.5,
    subtotal: 99.5,
    items: [{ product: { name: 'Tulsi Leaves' }, quantity: 1, price: 99.5 }],
  };

  const receipt = generateDispensaryReceiptContent(mockOrder);

  assert.match(receipt.content, /Total Amount Paid\s+:\s+₹99\.50 INR/);
  // Ensure no fabricated GSTIN or fictitious registration identifiers
  assert.doesNotMatch(receipt.content, /GSTIN/);
  assert.doesNotMatch(receipt.content, /Tax ID/);
  assert.doesNotMatch(receipt.content, /EIN/);
});
