import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  type DocumentData,
  Timestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../firebase';

export type OrderStatus =
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready_for_pickup'
  | 'collected'
  | 'cancelled';

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface StatusHistoryEntry {
  status?: string;
  paymentStatus?: string;
  timestamp: string;
  updatedBy?: string;
  note?: string;
  paidAt?: string;
  paidConfirmedBy?: string;
}

export interface AdminOrder {
  id: string;
  userId: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  pickupCode?: string;
  pickupAttempts?: number;
  pickupContact: {
    fullName: string;
    phone: string;
    notes?: string;
  };
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPricePaise: number;
  }>;
  subtotalPaise: number;
  totalPaise: number;
  pickupLocation?: string;
  statusHistory?: StatusHistoryEntry[];
  createdAt: string;
  updatedAt?: string;
}

function tsToString(v: any): string {
  if (!v) return new Date().toISOString();
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === 'string') return v;
  return new Date().toISOString();
}

function docToAdminOrder(id: string, data: DocumentData): AdminOrder {
  return {
    id,
    userId: String(data.userId ?? ''),
    orderStatus: (data.orderStatus ?? 'placed') as OrderStatus,
    paymentStatus: (data.paymentStatus ?? 'unpaid') as PaymentStatus,
    pickupCode: data.pickupCode ? String(data.pickupCode) : undefined,
    pickupAttempts: Number(data.pickupAttempts ?? 0),
    pickupContact: {
      fullName: String(data.pickupContact?.fullName ?? data.shippingAddress?.name ?? 'Unknown'),
      phone: String(data.pickupContact?.phone ?? data.shippingAddress?.phone ?? '—'),
      notes: data.pickupContact?.notes ?? data.shippingAddress?.notes,
    },
    items: Array.isArray(data.items)
      ? data.items.map((it: any) => ({
          productId: String(it.productId ?? ''),
          name: String(it.name ?? it.productId ?? 'Product'),
          quantity: Number(it.quantity ?? 1),
          unitPricePaise: Number(it.unitPricePaise ?? it.unitPrice ?? it.price ?? 0),
        }))
      : [],
    subtotalPaise: Number(data.subtotalPaise ?? data.total ?? 0),
    totalPaise: Number(data.totalPaise ?? data.total ?? 0),
    pickupLocation: data.pickupLocation ?? undefined,
    statusHistory: Array.isArray(data.statusHistory) ? data.statusHistory : [],
    createdAt: tsToString(data.createdAt),
    updatedAt: tsToString(data.updatedAt),
  };
}

export async function getAdminOrders(): Promise<AdminOrder[]> {
  try {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => docToAdminOrder(d.id, d.data()));
  } catch {
    const snap = await getDocs(collection(db, 'orders'));
    return snap.docs.map(d => docToAdminOrder(d.id, d.data()));
  }
}

/**
 * Subscribes to real-time order updates from Firestore without requiring page refreshes.
 */
export function subscribeAdminOrders(
  onOrders: (orders: AdminOrder[]) => void,
  onError?: (err: Error) => void
): () => void {
  let fallbackUnsub: (() => void) | null = null;

  try {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => docToAdminOrder(d.id, d.data()));
        onOrders(list);
      },
      (err) => {
        console.warn('Realtime orders query error, falling back to base collection listener:', err);
        fallbackUnsub = onSnapshot(
          collection(db, 'orders'),
          (snap) => {
            const list = snap.docs.map((d) => docToAdminOrder(d.id, d.data()));
            list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            onOrders(list);
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

export interface UpdateOrderStatusOptions {
  pickupCode?: string;
  note?: string;
}

/**
 * Updates an order status with server-side validation and pickup verification.
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  options?: UpdateOrderStatusOptions | string
): Promise<void> {
  const opts: UpdateOrderStatusOptions =
    typeof options === 'string' ? { note: options } : options || {};

  // 1. Try authoritative Cloud Function
  try {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../firebase');
    const updateFn = httpsCallable(functions, 'updateOrderStatus');
    await updateFn({
      orderId,
      newStatus,
      pickupCode: opts.pickupCode,
      note: opts.note,
    });
    return;
  } catch (fnErr: any) {
    console.warn('updateOrderStatus Cloud Function failed, checking Express / direct fallback:', fnErr);
    // If it's a domain logic validation error (e.g. invalid code or illegal transition), rethrow immediately
    if (fnErr.code && fnErr.code !== 'functions/not-found' && fnErr.code !== 'functions/unavailable') {
      throw new Error(fnErr.message || 'Failed to update order status');
    }
  }

  // 2. Fallback to Express backend if configured
  const adminBackendUrl = import.meta.env.VITE_ADMIN_API_URL;
  if (adminBackendUrl) {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    const res = await fetch(
      `${adminBackendUrl.replace(/\/$/, '')}/api/admin/orders/${orderId}/status`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          orderStatus: newStatus,
          pickupCode: opts.pickupCode,
          note: opts.note,
        }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return;
  }

  // 3. Fallback: direct Firestore write (admin only)
  const orderRef = doc(db, 'orders', orderId);
  await updateDoc(orderRef, {
    orderStatus: newStatus,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Records receipt of in-person Cash/UPI payment at the dispensary counter.
 * Strictly separates payment from fulfilment (does NOT change orderStatus).
 */
export async function markOrderPaid(orderId: string, note?: string): Promise<void> {
  // 1. Try authoritative Cloud Function
  try {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../firebase');
    const recordPaymentFn = httpsCallable(functions, 'recordOrderPayment');
    await recordPaymentFn({
      orderId,
      note: note || 'In-person payment confirmed received at dispensary counter (Cash/UPI)',
    });
    return;
  } catch (fnErr: any) {
    console.warn('recordOrderPayment Cloud Function failed, checking Express / direct fallback:', fnErr);
    if (fnErr.code && fnErr.code !== 'functions/not-found' && fnErr.code !== 'functions/unavailable') {
      throw new Error(fnErr.message || 'Failed to record payment');
    }
  }

  // 2. Fallback to Express backend if configured
  const adminBackendUrl = import.meta.env.VITE_ADMIN_API_URL;
  if (adminBackendUrl) {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    const res = await fetch(
      `${adminBackendUrl.replace(/\/$/, '')}/api/admin/orders/${orderId}/payment`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          note: note || 'In-person payment confirmed received at dispensary counter (Cash/UPI)',
        }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return;
  }

  // 3. Fallback: direct Firestore write (preserves fulfilment status intact)
  const orderRef = doc(db, 'orders', orderId);
  await updateDoc(orderRef, {
    paymentStatus: 'paid',
    updatedAt: serverTimestamp(),
  });
}

