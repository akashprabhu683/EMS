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
        // Fallback without orderBy if index is building or absent
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

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  note?: string
): Promise<void> {
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
        body: JSON.stringify({ orderStatus: newStatus, note }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return;
  }

  // Fallback: direct Firestore write (admin only)
  const orderRef = doc(db, 'orders', orderId);
  await updateDoc(orderRef, {
    orderStatus: newStatus,
    updatedAt: serverTimestamp(),
  });
}

export async function markOrderPaid(orderId: string, note?: string): Promise<void> {
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
          paymentStatus: 'paid',
          orderStatus: 'collected',
          note: note || 'Payment confirmed in person at dispensary',
        }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return;
  }

  // Fallback: direct Firestore write
  const orderRef = doc(db, 'orders', orderId);
  await updateDoc(orderRef, {
    paymentStatus: 'paid',
    orderStatus: 'collected',
    updatedAt: serverTimestamp(),
  });
}
