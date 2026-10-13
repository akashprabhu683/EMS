import type { Order } from '../types';
import { PRODUCTS } from './products';

export const MOCK_ORDERS: Order[] = [
  {
    id: 'NS-8492014',
    date: 'October 5, 2026',
    status: 'delivered',
    statusLabel: 'Delivered',
    items: [
      {
        product: PRODUCTS[0], // AirPods Pro Max Ultra
        quantity: 1,
        selectedColor: '#1a1a1a',
        price: 349,
      },
      {
        product: PRODUCTS[2], // Smart LED Desk Lamp
        quantity: 1,
        price: 89,
      },
    ],
    subtotal: 438,
    shipping: 0,
    tax: 35.04,
    total: 473.04,
    shippingAddress: {
      fullName: 'Marcus Vance',
      street: '742 Evergreen Terrace, Suite 300',
      city: 'Portland',
      state: 'OR',
      zip: '97201',
      country: 'United States',
      phone: '+1 (555) 382-9104',
      email: 'marcus.vance@example.com',
    },
    paymentMethod: {
      brand: 'Visa',
      last4: '4242',
      demoNote: 'Demo checkout — no payment is processed',
    },
    trackingNumber: 'TRK-NV-982341908',
    courier: 'FedEx Priority Air',
    estimatedDelivery: 'October 7, 2026 (Delivered)',
    timeline: [
      {
        title: 'Order Confirmed',
        description: 'Payment verified and order details logged in demo system.',
        timestamp: 'Oct 5, 2026 · 10:14 AM',
        completed: true,
      },
      {
        title: 'Dispatched from Hub',
        description: 'Parcel packaged with eco-friendly cushioning and handed to courier.',
        timestamp: 'Oct 5, 2026 · 04:30 PM',
        completed: true,
      },
      {
        title: 'In Transit',
        description: 'Arrived at regional distribution sorting center.',
        timestamp: 'Oct 6, 2026 · 08:22 AM',
        completed: true,
      },
      {
        title: 'Out for Delivery',
        description: 'Courier agent on route with destination package.',
        timestamp: 'Oct 7, 2026 · 09:15 AM',
        completed: true,
      },
      {
        title: 'Delivered',
        description: 'Signed and delivered at front doorstep.',
        timestamp: 'Oct 7, 2026 · 02:40 PM',
        completed: true,
      },
    ],
  },
  {
    id: 'NS-7319402',
    date: 'October 3, 2026',
    status: 'shipped',
    statusLabel: 'In Transit',
    items: [
      {
        product: PRODUCTS[1], // Minimalist Leather Jacket
        quantity: 1,
        selectedSize: 'L',
        selectedColor: '#1a1a1a',
        price: 289,
      },
    ],
    subtotal: 289,
    shipping: 0,
    tax: 23.12,
    total: 312.12,
    shippingAddress: {
      fullName: 'Marcus Vance',
      street: '742 Evergreen Terrace, Suite 300',
      city: 'Portland',
      state: 'OR',
      zip: '97201',
      country: 'United States',
      phone: '+1 (555) 382-9104',
      email: 'marcus.vance@example.com',
    },
    paymentMethod: {
      brand: 'Mastercard',
      last4: '8812',
      demoNote: 'Demo checkout — no payment is processed',
    },
    trackingNumber: 'TRK-NV-812049112',
    courier: 'DHL Express Global',
    estimatedDelivery: 'October 9, 2026',
    timeline: [
      {
        title: 'Order Confirmed',
        description: 'Order placed and authenticated.',
        timestamp: 'Oct 3, 2026 · 02:20 PM',
        completed: true,
      },
      {
        title: 'Packaged & Inspected',
        description: 'Quality inspection passed at warehouse.',
        timestamp: 'Oct 4, 2026 · 11:00 AM',
        completed: true,
      },
      {
        title: 'In Transit',
        description: 'En route to recipient destination hub.',
        timestamp: 'Oct 5, 2026 · 06:45 PM',
        completed: true,
      },
      {
        title: 'Out for Delivery',
        description: 'Courier scheduled for morning dispatch.',
        timestamp: 'Pending delivery window',
        completed: false,
      },
      {
        title: 'Delivered',
        description: 'Pending final handover.',
        timestamp: 'Estimated Oct 9, 2026',
        completed: false,
      },
    ],
  },
  {
    id: 'NS-6204588',
    date: 'September 24, 2026',
    status: 'delivered',
    statusLabel: 'Delivered',
    items: [
      {
        product: PRODUCTS[3] || PRODUCTS[0],
        quantity: 1,
        price: 159,
      },
    ],
    subtotal: 159,
    shipping: 0,
    tax: 12.72,
    total: 171.72,
    shippingAddress: {
      fullName: 'Marcus Vance',
      street: '742 Evergreen Terrace, Suite 300',
      city: 'Portland',
      state: 'OR',
      zip: '97201',
      country: 'United States',
      phone: '+1 (555) 382-9104',
      email: 'marcus.vance@example.com',
    },
    paymentMethod: {
      brand: 'Visa',
      last4: '4242',
      demoNote: 'Demo checkout — no payment is processed',
    },
    trackingNumber: 'TRK-NV-719302844',
    courier: 'UPS Ground Express',
    estimatedDelivery: 'September 27, 2026 (Delivered)',
    timeline: [
      {
        title: 'Order Confirmed',
        description: 'Payment authorized in demo sandbox.',
        timestamp: 'Sep 24, 2026 · 09:30 AM',
        completed: true,
      },
      {
        title: 'Dispatched from Hub',
        description: 'Shipped from Seattle fulfillment center.',
        timestamp: 'Sep 25, 2026 · 01:10 PM',
        completed: true,
      },
      {
        title: 'Delivered',
        description: 'Delivered to resident.',
        timestamp: 'Sep 27, 2026 · 11:45 AM',
        completed: true,
      },
    ],
  },
  {
    id: 'NS-5192077',
    date: 'August 12, 2026',
    status: 'delivered',
    statusLabel: 'Delivered',
    items: [
      {
        product: PRODUCTS[4] || PRODUCTS[2],
        quantity: 2,
        price: 32,
      },
    ],
    subtotal: 64,
    shipping: 0,
    tax: 5.12,
    total: 69.12,
    shippingAddress: {
      fullName: 'Marcus Vance',
      street: '742 Evergreen Terrace, Suite 300',
      city: 'Portland',
      state: 'OR',
      zip: '97201',
      country: 'United States',
      phone: '+1 (555) 382-9104',
      email: 'marcus.vance@example.com',
    },
    paymentMethod: {
      brand: 'Apple Pay',
      last4: '1092',
      demoNote: 'Demo checkout — no payment is processed',
    },
    trackingNumber: 'TRK-NV-501928374',
    courier: 'USPS Priority Mail',
    estimatedDelivery: 'August 15, 2026 (Delivered)',
    timeline: [
      {
        title: 'Delivered',
        description: 'Package delivered in mailbox.',
        timestamp: 'Aug 15, 2026 · 03:15 PM',
        completed: true,
      },
    ],
  },
];

export function getMockOrders(): Order[] {
  return MOCK_ORDERS;
}

export function getOrderById(id: string): Order | undefined {
  const normalized = id.toLowerCase().trim();
  return MOCK_ORDERS.find(
    o => o.id.toLowerCase() === normalized || o.id.replace('ns-', '').toLowerCase() === normalized.replace('ns-', '')
  );
}

/**
 * Generates and triggers browser download of an invoice document.
 * Purely client-side demo file download.
 */
export function downloadMockInvoice(order: {
  id: string;
  date?: string;
  total?: number;
  items?: { product: { name: string }; quantity: number; price: number }[];
  shippingAddress?: { fullName?: string; street?: string; city?: string; state?: string };
}) {
  const invoiceContent = `
=============================================================
                  NOVASHOP OFFICIAL RECEIPT
=============================================================
Order Reference  : ${order.id}
Date Issued      : ${order.date || new Date().toLocaleDateString()}
Customer Name    : ${order.shippingAddress?.fullName || 'Valued Customer'}
Delivery Address : ${order.shippingAddress?.street || '742 Evergreen Terrace'}, ${order.shippingAddress?.city || 'Portland'}, ${order.shippingAddress?.state || 'OR'}
Payment Status   : Paid (Demo Checkout - No real payment processed)
-------------------------------------------------------------
ITEMS PURCHASED:
${(order.items || [])
  .map(
    (item, idx) =>
      `  ${idx + 1}. ${item.product.name.padEnd(35)} x${item.quantity}   $${(item.price * item.quantity).toFixed(2)}`
  )
  .join('\n')}
-------------------------------------------------------------
Total Amount     : $${(order.total || 0).toFixed(2)} USD
Security Check   : Verified 256-Bit SSL Encrypted Transaction
=============================================================
Thank you for choosing NovaShop!
Support contact: support@novashop.demo
=============================================================
`.trim();

  const blob = new Blob([invoiceContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Invoice-${order.id}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
