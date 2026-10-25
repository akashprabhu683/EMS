import type { Order } from '../types';

export interface GeneratedReceipt {
  title: string;
  filename: string;
  content: string;
  isPaidReceipt: boolean;
}

/**
 * Generates an authoritative, plain-text receipt or order confirmation
 * based strictly on trusted order data returned by the backend.
 *
 * Rules:
 * - If order.paymentStatus === 'paid', labeled as an official in-person paid receipt.
 * - If order.paymentStatus !== 'paid', labeled as an order confirmation / voucher with explicit note that payment is due at counter.
 * - Never invents tax rates, GSTIN, or dispensary registration numbers.
 * - Displays prices and totals in INR (₹) matching authoritative Firestore records.
 */
export function generateDispensaryReceiptContent(order: Order): GeneratedReceipt {
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

/**
 * Triggers a browser download of the generated receipt or confirmation document.
 */
export function downloadDispensaryReceipt(order: Order): { isPaidReceipt: boolean; filename: string } {
  const { filename, content, isPaidReceipt } = generateDispensaryReceiptContent(order);

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  return { isPaidReceipt, filename };
}
