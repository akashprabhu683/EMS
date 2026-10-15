import { collection, query, where, getDocs, doc, getDoc, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { Order, OrderStatus } from '../types';

export interface FirestoreOrderRecord {
  id: string;
  userId: string;
  items: Array<{
    productId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    imageUrl?: string;
    selectedColor?: string;
    selectedSize?: string;
  }>;
  subtotal: number;
  shippingFee: number;
  codFee: number;
  total: number;
  shippingAddress: {
    name: string;
    phone: string;
    line1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  itemCount: number;
  createdAt?: any;
  updatedAt?: any;
}

export function formatFirestoreOrder(docId: string, data: any): Order {
  const DEFAULT_MED_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80';

  const items = Array.isArray(data.items)
    ? data.items.map((item: any, idx: number) => {
        const itemPriceRupees = Number((item.unitPrice || item.price || 0) / (item.unitPrice ? 100 : 1)) || 0;
        const img = item.imageUrl || (Array.isArray(item.images) && item.images[0]) || DEFAULT_MED_IMAGE;
        return {
          product: {
            id: item.productId || `item-${idx}`,
            name: item.name || 'Herbal Product',
            description: item.description || 'Natural herbal remedy formulation',
            price: itemPriceRupees,
            images: [img],
            category: item.category || 'general',
            rating: 5,
            reviewCount: 1,
            stock: 10,
            tags: [],
            featured: false,
            isNew: false,
          },
          price: itemPriceRupees,
          quantity: Number(item.quantity) || 1,
          selectedColor: item.selectedColor,
          selectedSize: item.selectedSize,
        };
      })
    : [];

  const createdDate = data.createdAt?.toDate
    ? data.createdAt.toDate().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

  const totalRupees = (data.total || 0) / 100;
  const subtotalRupees = (data.subtotal || 0) / 100;
  const shippingRupees = (data.shippingFee || 0) / 100;
  const pickupLocation = data.pickupLocation || 'EMS Herbal Dispensary, Main Road Health Complex, Pin: 560001';
  const customerName = data.pickupContact?.fullName || data.shippingAddress?.name || data.shippingAddress?.fullName || 'Valued Customer';
  const customerPhone = data.pickupContact?.phone || data.shippingAddress?.phone || '';

  const statusTitleMap: Record<string, string> = {
    placed: 'Order Placed (Awaiting Acceptance)',
    accepted: 'Order Accepted by Dispensary',
    preparing: 'Remedies Being Prepared',
    ready_for_pickup: 'Ready for Collection at Shop',
    collected: 'Collected & Paid at Shop',
    cancelled: 'Order Cancelled',
  };

  const statusLabel = statusTitleMap[data.orderStatus] || String(data.orderStatus || 'Placed').toUpperCase();

  return {
    id: docId,
    date: createdDate,
    status: (data.orderStatus as OrderStatus) || 'processing',
    statusLabel,
    items,
    subtotal: subtotalRupees,
    shipping: shippingRupees,
    tax: 0,
    total: totalRupees,
    paymentStatus: (data.paymentStatus as any) || 'unpaid',
    pickupContact: data.pickupContact || { fullName: customerName, phone: customerPhone },
    pickupLocation,
    paymentMethod: {
      type: 'click_and_collect',
      last4: 'PAY AT SHOP',
      demoNote: data.paymentStatus === 'paid' ? 'Paid in Person' : 'Pay at Shop upon Collection',
    },
    shippingAddress: {
      fullName: customerName,
      street: `Pickup at: ${pickupLocation}`,
      city: 'Dispensary Counter',
      state: 'Ready upon Notification',
      zip: 'Collect in Person',
      country: 'India',
      phone: customerPhone,
    },
    trackingNumber: `EMS-COLLECT-${docId.slice(-6).toUpperCase()}`,
    courier: 'Self Collection at Dispensary',
    estimatedDelivery: data.orderStatus === 'ready_for_pickup' ? 'Ready for Collection NOW' : 'Ready within 2-4 hours',
    timeline: Array.isArray(data.statusHistory) && data.statusHistory.length > 0
      ? data.statusHistory.map((h: any) => ({
          title: statusTitleMap[h.status] || h.status,
          timestamp: h.timestamp ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : createdDate,
          completed: true,
          description: h.note || `Order status updated to ${h.status}`,
        }))
      : [
          {
            title: 'Order Placed',
            timestamp: createdDate,
            completed: true,
            description: 'Order registered. The dispensary pharmacist is preparing your herbal remedies.',
          },
        ],
  };
}

export async function getUserOrders(uid: string): Promise<Order[]> {
  if (!uid) return [];

  // Try backend endpoint first
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl && auth.currentUser) {
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/orders/user/${uid}`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.orders)) {
          return json.orders.map((o: any) => formatFirestoreOrder(o.id, o));
        }
      }
    } catch (err) {
      console.warn('Backend orders fetch failed, falling back to direct Firestore:', err);
    }
  }

  // Fallback to direct Firestore
  try {
    const q = query(
      collection(db, 'orders'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(docSnap => formatFirestoreOrder(docSnap.id, docSnap.data()));
  } catch (err) {
    // If composite index is pending, query without orderBy
    try {
      const fallbackQ = query(collection(db, 'orders'), where('userId', '==', uid));
      const snap = await getDocs(fallbackQ);
      return snap.docs.map(docSnap => formatFirestoreOrder(docSnap.id, docSnap.data()));
    } catch (fallbackErr) {
      console.error('Failed to load user orders:', fallbackErr);
      return [];
    }
  }
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  if (!orderId) return null;
  try {
    const docRef = doc(db, 'orders', orderId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return formatFirestoreOrder(snap.id, snap.data());
  } catch (err) {
    console.error('Failed to load order by ID:', err);
    return null;
  }
}
