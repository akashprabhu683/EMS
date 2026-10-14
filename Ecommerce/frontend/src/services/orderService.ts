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
  const items = Array.isArray(data.items)
    ? data.items.map((item: any, idx: number) => ({
        product: {
          id: item.productId || `item-${idx}`,
          name: item.name || 'Product',
          description: '',
          price: (item.unitPrice || 0) / 100,
          images: item.imageUrl ? [item.imageUrl] : [],
          category: 'general',
          rating: 5,
          reviewCount: 1,
          stock: 10,
          tags: [],
          featured: false,
          isNew: false,
        },
        quantity: item.quantity || 1,
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
      }))
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

  return {
    id: docId,
    date: createdDate,
    status: (data.orderStatus as OrderStatus) || 'processing',
    statusLabel: String(data.orderStatus || 'Processing').toUpperCase(),
    items,
    subtotal: subtotalRupees,
    shipping: shippingRupees,
    tax: 0,
    total: totalRupees,
    paymentMethod: {
      type: data.paymentMethod || 'cod',
      last4: 'COD',
      demoNote: 'Cash on Delivery',
    },
    shippingAddress: {
      fullName: data.shippingAddress?.name || 'Customer',
      street: data.shippingAddress?.line1 || '',
      city: data.shippingAddress?.city || '',
      state: data.shippingAddress?.state || '',
      zip: data.shippingAddress?.postalCode || '',
      country: data.shippingAddress?.country || 'India',
    },
    trackingNumber: `EMS-${docId.slice(-6).toUpperCase()}`,
    courier: 'EMS Express Logistics',
    estimatedDelivery: '3-5 business days',
    timeline: [
      {
        title: 'Order Placed',
        timestamp: createdDate,
        completed: true,
        description: 'Order confirmed and registered in EMS system.',
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
