import { collection, query, where, getDocs, doc, getDoc, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
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
  const pickupLocation = data.pickupLocation || 'EMS Herbal Dispensary, Main Road Health Complex, Postal Code: 560001';
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
    pickupCode: data.pickupCode ? String(data.pickupCode) : undefined,
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
    estimatedDelivery: (() => {
      const s = String(data.orderStatus || '').toLowerCase();
      if (s === 'ready_for_pickup') return 'Ready for Collection NOW';
      if (s === 'collected' || s === 'delivered') return 'Collected ✓';
      if (s === 'cancelled') return 'Order Cancelled';
      if (s === 'accepted') return 'Accepted — Preparing soon';
      if (s === 'preparing') return 'Being Prepared now';
      if (s === 'placed') return 'Awaiting dispensary acceptance';
      return 'Awaiting dispensary acceptance';
    })(),
    timeline: Array.isArray(data.statusHistory) && data.statusHistory.length > 0
      ? data.statusHistory.map((h: any) => {
          const isPayment = h.eventType === 'PAYMENT_RECORDED' || h.paymentStatus === 'paid';
          const title = isPayment
            ? 'Payment Received (Counter)'
            : (statusTitleMap[h.status] || (h.status ? String(h.status).replace(/_/g, ' ').toUpperCase() : 'Order Update'));
          const description = h.note || (isPayment ? 'In-person payment confirmed received at dispensary counter.' : `Order status updated to ${h.status || 'current state'}`);
          const timestamp = h.timestamp
            ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : createdDate;
          return {
            title,
            timestamp,
            completed: true,
            description,
          };
        })
      : [
          {
            title: 'Order Placed',
            timestamp: createdDate,
            completed: true,
            description: 'Order registered. Awaiting dispensary acceptance.',
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

  // Local-storage presentation filter: hides dismissed orders from customer view without deleting database records
  const hiddenIds = new Set(getHiddenOrderIds(uid));

  // Fallback to direct Firestore
  try {
    const q = query(
      collection(db, 'orders'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs
      .filter((docSnap) => !hiddenIds.has(docSnap.id))
      .map((docSnap) => formatFirestoreOrder(docSnap.id, docSnap.data()));
  } catch (err) {
    // If composite index is pending, query without orderBy
    try {
      const fallbackQ = query(collection(db, 'orders'), where('userId', '==', uid));
      const snap = await getDocs(fallbackQ);
      return snap.docs
        .filter((docSnap) => !hiddenIds.has(docSnap.id))
        .map((docSnap) => formatFirestoreOrder(docSnap.id, docSnap.data()));
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

const HIDDEN_ORDERS_STORAGE_KEY_PREFIX = 'ems_hidden_orders_';

/**
 * Retrieves the list of order IDs hidden locally by the customer.
 * Note: Presentation only; does not affect authoritative backend or admin queues.
 */
export function getHiddenOrderIds(uid: string): string[] {
  if (typeof window === 'undefined' || !uid) return [];
  try {
    const raw = localStorage.getItem(`${HIDDEN_ORDERS_STORAGE_KEY_PREFIX}${uid}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Hides a specific order from the customer's browser view without altering or deleting Firestore data.
 */
export function hideOrderFromView(uid: string, orderId: string): void {
  if (typeof window === 'undefined' || !uid || !orderId) return;
  try {
    const set = new Set(getHiddenOrderIds(uid));
    set.add(orderId);
    localStorage.setItem(`${HIDDEN_ORDERS_STORAGE_KEY_PREFIX}${uid}`, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.warn('Failed to save hidden order to localStorage:', err);
  }
}

/**
 * Hides all supplied orders from the customer's browser view without deleting any database records.
 */
export function hideAllOrdersFromView(uid: string, orderIds: string[]): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    const set = new Set(getHiddenOrderIds(uid));
    orderIds.forEach((id) => set.add(id));
    localStorage.setItem(`${HIDDEN_ORDERS_STORAGE_KEY_PREFIX}${uid}`, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.warn('Failed to save hidden orders to localStorage:', err);
  }
}

/**
 * Safe replacement for physical deletion: Hides order from customer view without deleting database record.
 */
export async function deleteOrder(orderId: string, uid?: string): Promise<void> {
  if (uid && orderId) {
    hideOrderFromView(uid, orderId);
  }
}

/**
 * Safe replacement for clearing all orders: Hides order history from customer view without deleting database records.
 */
export async function clearAllUserOrders(uid: string, orderIds?: string[]): Promise<number> {
  if (!uid) return 0;
  if (orderIds && orderIds.length > 0) {
    hideAllOrdersFromView(uid, orderIds);
    return orderIds.length;
  }
  return 0;
}

/**
 * Subscribes to real-time updates for a customer's orders list.
 * Live changes (e.g. accepted, preparing, ready_for_pickup) stream immediately without refresh.
 * Filters out locally dismissed/hidden orders from presentation.
 */
export function subscribeUserOrders(
  uid: string,
  onOrders: (orders: Order[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!uid) {
    onOrders([]);
    return () => {};
  }

  let fallbackUnsub: (() => void) | null = null;

  try {
    const q = query(
      collection(db, 'orders'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const hiddenIds = new Set(getHiddenOrderIds(uid));
        const orders = snap.docs
          .filter((d) => !hiddenIds.has(d.id))
          .map((d) => formatFirestoreOrder(d.id, d.data()));
        onOrders(orders);
      },
      (err) => {
        console.warn('Real-time customer orders query failed, falling back to base filter:', err);
        fallbackUnsub = onSnapshot(
          query(collection(db, 'orders'), where('userId', '==', uid)),
          (snap) => {
            const hiddenIds = new Set(getHiddenOrderIds(uid));
            const orders = snap.docs
              .filter((d) => !hiddenIds.has(d.id))
              .map((d) => formatFirestoreOrder(d.id, d.data()));
            onOrders(orders);
          },
          onError
        );
      }
    );

    return () => {
      unsubscribe();
      if (fallbackUnsub) fallbackUnsub();
    };
  } catch (err: any) {
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Subscribes to real-time status updates for a single order (tracking page).
 */
export function subscribeOrderDetail(
  orderId: string,
  onOrder: (order: Order | null) => void,
  onError?: (err: Error) => void
): () => void {
  if (!orderId) {
    onOrder(null);
    return () => {};
  }

  try {
    const docRef = doc(db, 'orders', orderId);
    return onSnapshot(
      docRef,
      (snap) => {
        if (!snap.exists()) {
          onOrder(null);
        } else {
          onOrder(formatFirestoreOrder(snap.id, snap.data()));
        }
      },
      (err) => {
        console.error(`Real-time order subscription error for #${orderId}:`, err);
        if (onError) onError(err);
      }
    );
  } catch (err: any) {
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Cancels an order requested by the customer.
 * Permitted only if the order status is currently 'placed'.
 */
export async function cancelCustomerOrder(orderId: string, note?: string): Promise<void> {
  const updateFn = httpsCallable<
    { orderId: string; newStatus: string; note?: string },
    { success: boolean }
  >(functions, 'updateOrderStatus');

  await updateFn({
    orderId,
    newStatus: 'cancelled',
    note: note || 'Customer requested order cancellation',
  });
}

