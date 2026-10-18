import React, { useState, useEffect, useCallback } from 'react';
import {
  Package, CheckCircle2, Clock, MapPin, Phone,
  ChevronDown, ChevronUp, RefreshCw, Filter,
  Loader2, IndianRupee, User,
} from 'lucide-react';
import clsx from 'clsx';
import { useToast } from '../context/ToastContext';
import {
  getAdminOrders,
  subscribeAdminOrders,
  updateOrderStatus,
  markOrderPaid,
  type AdminOrder,
  type OrderStatus,
} from '../services/adminOrderService';

/* ── Status config with legacy support ──────────────────────────── */
const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string; dot: string }
> = {
  placed:          { label: 'Placed',          color: 'text-emerald-800', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-600' },
  accepted:        { label: 'Accepted',        color: 'text-teal-800',    bg: 'bg-teal-50',    border: 'border-teal-200',    dot: 'bg-teal-600' },
  preparing:       { label: 'Preparing',       color: 'text-amber-800',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-600 animate-pulse' },
  ready_for_pickup: { label: 'Ready for Pickup', color: 'text-emerald-800', bg: 'bg-emerald-100', border: 'border-emerald-300', dot: 'bg-emerald-600 animate-pulse' },
  collected:       { label: 'Collected ✓',    color: 'text-slate-700',   bg: 'bg-slate-100',  border: 'border-slate-300',   dot: 'bg-slate-500' },
  cancelled:       { label: 'Cancelled',       color: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-200',    dot: 'bg-rose-500' },
  // Legacy status support
  confirmed:       { label: 'Confirmed',       color: 'text-emerald-800', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-600' },
  delivered:       { label: 'Delivered',       color: 'text-slate-700',   bg: 'bg-slate-100',  border: 'border-slate-300',   dot: 'bg-slate-500' },
  processing:      { label: 'Processing',      color: 'text-amber-800',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-600' },
  shipped:         { label: 'Shipped',         color: 'text-teal-800',    bg: 'bg-teal-50',    border: 'border-teal-200',    dot: 'bg-teal-600' },
};

const DEFAULT_STATUS_CONFIG = {
  label: 'Placed',
  color: 'text-emerald-800',
  bg: 'bg-emerald-50',
  border: 'border-emerald-200',
  dot: 'bg-emerald-600',
};

/* Next statuses the admin can advance an order to */
const NEXT_STATUSES: Record<string, OrderStatus[]> = {
  placed:           ['accepted', 'cancelled'],
  accepted:         ['preparing', 'cancelled'],
  preparing:        ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['collected', 'cancelled'],
  collected:        [],
  cancelled:        [],
  confirmed:        ['preparing', 'ready_for_pickup', 'cancelled'],
  processing:       ['ready_for_pickup', 'cancelled'],
  shipped:          ['collected'],
  delivered:        [],
};

const ALL_STATUSES: OrderStatus[] = [
  'placed', 'accepted', 'preparing', 'ready_for_pickup', 'collected', 'cancelled',
];

const FILTER_TABS: { key: OrderStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All Orders' },
  { key: 'placed', label: 'Placed' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready_for_pickup', label: 'Ready' },
  { key: 'collected', label: 'Collected' },
  { key: 'cancelled', label: 'Cancelled' },
];

/* ── Formatting ──────────────────────────────────────────────── */
function paiseToRupees(paise?: number): string {
  const p = Number(paise) || 0;
  return (p / 100).toFixed(2);
}

function formatDate(iso?: string): string {
  if (!iso) return 'Recent';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

/* ── Order Card ───────────────────────────────────────────────── */
function OrderCard({
  order,
  onStatusChange,
  onMarkPaid,
}: {
  order: AdminOrder;
  onStatusChange: (orderId: string, status: OrderStatus) => Promise<void>;
  onMarkPaid: (orderId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const toast = useToast();

  const statusKey = String(order?.orderStatus || 'placed').toLowerCase();
  const cfg = STATUS_CONFIG[statusKey] || DEFAULT_STATUS_CONFIG;
  const nextStatuses = NEXT_STATUSES[statusKey] || [];
  const contact = order?.pickupContact || { fullName: 'Valued Customer', phone: '—', notes: '' };
  const itemsList = Array.isArray(order?.items) ? order.items : [];
  const totalPaise = Number(order?.totalPaise ?? order?.subtotalPaise ?? 0);

  const canMarkPaid =
    order.paymentStatus === 'unpaid' &&
    (statusKey === 'ready_for_pickup' || statusKey === 'collected');

  const handleStatusChange = async (newStatus: OrderStatus) => {
    setUpdating(true);
    try {
      await onStatusChange(order.id, newStatus);
    } catch (e: any) {
      toast.error(e.message || 'Failed to update order status. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const handleMarkPaid = async () => {
    setUpdating(true);
    try {
      await onMarkPaid(order.id);
    } catch (e: any) {
      toast.error(e.message || 'Failed to mark order as paid. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs hover:shadow-sm transition-shadow">
      {/* Header row */}
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md select-all">
              {order.id}
            </span>
            {/* Status badge */}
            <span className={clsx(
              'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border',
              cfg.bg, cfg.color, cfg.border
            )}>
              <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
              {cfg.label}
            </span>
            {/* Payment status */}
            <span className={clsx(
              'text-[11px] font-semibold px-2 py-0.5 rounded-full border',
              order.paymentStatus === 'paid'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : order.paymentStatus === 'refunded'
                ? 'bg-violet-50 text-violet-700 border-violet-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            )}>
              {order.paymentStatus === 'paid' ? '✓ Paid' : order.paymentStatus === 'refunded' ? 'Refunded' : '⏳ Unpaid · Pay at Shop'}
            </span>
          </div>

          {/* Pickup contact */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1">
              <User size={11} className="text-slate-400" />
              <strong className="text-slate-800">{contact.fullName}</strong>
            </span>
            <span className="flex items-center gap-1">
              <Phone size={11} className="text-slate-400" />
              {contact.phone}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} className="text-slate-400" />
              {formatDate(order.createdAt)}
            </span>
          </div>
          {contact.notes && (
            <p className="text-[11px] text-slate-500 mt-1 italic">
              Note: {contact.notes}
            </p>
          )}
        </div>

        {/* Total + expand */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-xs text-slate-500">Order Total</div>
            <div className="font-bold text-slate-900 flex items-center gap-0.5 text-sm sm:text-base text-emerald-700">
              <IndianRupee size={13} />
              {paiseToRupees(totalPaise)}
            </div>
          </div>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-100 p-4 sm:p-5 space-y-4 bg-slate-50">

          {/* Items */}
          <div>
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Package size={11} />
              Order Items ({itemsList.length})
            </h4>
            <div className="space-y-2">
              {itemsList.length > 0 ? itemsList.map((item, i) => (
                <div key={i} className="flex justify-between text-xs text-slate-700 bg-white rounded-xl px-3 py-2 border border-slate-200">
                  <span className="font-medium">{item.name || item.productId || 'Herbal Item'} × {item.quantity || 1}</span>
                  <span className="font-semibold text-slate-900">
                    ₹{paiseToRupees((item.unitPricePaise || 0) * (item.quantity || 1))}
                  </span>
                </div>
              )) : (
                <p className="text-xs text-slate-400">Item details not available.</p>
              )}
            </div>
          </div>

          {/* Status History */}
          {Array.isArray(order.statusHistory) && order.statusHistory.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Status History
              </h4>
              <div className="space-y-1.5">
                {order.statusHistory.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] text-slate-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <span>
                      {entry.status && <strong>{entry.status}</strong>}
                      {entry.paymentStatus && ` — Payment: ${entry.paymentStatus}`}
                      {entry.note && ` · ${entry.note}`}
                      <span className="text-slate-400 ml-1">{formatDate(entry.timestamp)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {(nextStatuses.length > 0 || canMarkPaid) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {updating ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 px-3 py-2">
                  <Loader2 size={14} className="animate-spin text-emerald-600" />
                  Updating order…
                </div>
              ) : (
                <>
                  {nextStatuses.map(s => {
                    const sc = STATUS_CONFIG[s] || DEFAULT_STATUS_CONFIG;
                    const isPrimary = s !== 'cancelled';
                    return (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        id={`order-${order.id}-status-${s}`}
                        className={clsx(
                          'px-3 py-2 rounded-xl text-xs font-semibold transition-colors border',
                          isPrimary
                            ? `${sc.bg} ${sc.color} ${sc.border} hover:opacity-80`
                            : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                        )}
                      >
                        → Advance to {sc.label}
                      </button>
                    );
                  })}
                  {canMarkPaid && (
                    <button
                      onClick={handleMarkPaid}
                      id={`order-${order.id}-mark-paid`}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-700 text-white border border-emerald-800 hover:bg-emerald-800 transition-colors flex items-center gap-1.5 shadow-xs"
                    >
                      <IndianRupee size={12} />
                      Confirm In-Person Payment Received
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Orders List Page ────────────────────────────────────── */
export function OrdersListPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeAdminOrders(
      (liveOrders) => {
        setOrders(Array.isArray(liveOrders) ? liveOrders : []);
        setLoading(false);
      },
      (err) => {
        console.error('Realtime orders error:', err);
        toast.error('Failed to stream real-time orders.');
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    await updateOrderStatus(orderId, newStatus);
    setOrders(prev =>
      prev.map(o => o.id === orderId ? { ...o, orderStatus: newStatus } : o)
    );
  };

  const handleMarkPaid = async (orderId: string) => {
    await markOrderPaid(orderId);
    setOrders(prev =>
      prev.map(o => o.id === orderId ? { ...o, paymentStatus: 'paid', orderStatus: 'collected' } : o)
    );
  };

  const filtered = filterStatus === 'all'
    ? orders
    : orders.filter(o => o.orderStatus === filterStatus);

  const counts: Record<string, number> = { all: orders.length };
  ALL_STATUSES.forEach(s => {
    counts[s] = orders.filter(o => o.orderStatus === s).length;
  });

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">
            Orders Management
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Dispensary Click &amp; Collect orders — track preparation, collection, and in-person payments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live Stream</span>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              getAdminOrders().then(d => { setOrders(d); setLoading(false); });
            }}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-100 transition-colors disabled:opacity-60"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-emerald-600' : ''} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key)}
            className={clsx(
              'px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1',
              filterStatus === key
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            )}
          >
            <Filter size={10} />
            {label}
            {(counts[key] || 0) > 0 && (
              <span className={clsx(
                'ml-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[10px] font-bold',
                filterStatus === key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              )}>
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>


      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 size={28} className="animate-spin text-emerald-600" />
            <span className="text-sm">Loading orders…</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <Package size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">No orders found</p>
          <p className="text-sm text-slate-400 mt-1">
            {filterStatus === 'all' ? 'No orders have been placed yet.' : `No orders with status "${filterStatus}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusChange={handleStatusChange}
              onMarkPaid={handleMarkPaid}
            />
          ))}
        </div>
      )}
    </div>
  );
}
