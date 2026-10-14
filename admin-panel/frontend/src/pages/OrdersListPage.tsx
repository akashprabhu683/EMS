import React, { useState, useEffect, useCallback } from 'react';
import {
  Package, CheckCircle2, Clock, MapPin, Phone,
  ChevronDown, ChevronUp, RefreshCw, Filter,
  AlertCircle, Loader2, IndianRupee, User,
} from 'lucide-react';
import clsx from 'clsx';
import {
  getAdminOrders,
  updateOrderStatus,
  markOrderPaid,
  type AdminOrder,
  type OrderStatus,
} from '../services/adminOrderService';

/* ── Status config ──────────────────────────────────────────── */
const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; color: string; bg: string; border: string; dot: string }
> = {
  placed:          { label: 'Placed',          color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   dot: 'bg-blue-500' },
  accepted:        { label: 'Accepted',         color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200', dot: 'bg-indigo-500' },
  preparing:       { label: 'Preparing',        color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  dot: 'bg-amber-500 animate-pulse' },
  ready_for_pickup: { label: 'Ready for Pickup', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500 animate-pulse' },
  collected:       { label: 'Collected ✓',     color: 'text-slate-600',  bg: 'bg-slate-100', border: 'border-slate-200',  dot: 'bg-slate-400' },
  cancelled:       { label: 'Cancelled',        color: 'text-rose-700',   bg: 'bg-rose-50',   border: 'border-rose-200',   dot: 'bg-rose-500' },
};

/* Next statuses the admin can advance an order to */
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  placed:           ['accepted', 'cancelled'],
  accepted:         ['preparing', 'cancelled'],
  preparing:        ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['collected', 'cancelled'],
  collected:        [],
  cancelled:        [],
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
function paiseToRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
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
  const [error, setError] = useState('');

  const cfg = STATUS_CONFIG[order.orderStatus];
  const nextStatuses = NEXT_STATUSES[order.orderStatus];
  const canMarkPaid =
    order.paymentStatus === 'unpaid' &&
    (order.orderStatus === 'ready_for_pickup' || order.orderStatus === 'collected');

  const handleStatusChange = async (newStatus: OrderStatus) => {
    setError('');
    setUpdating(true);
    try {
      await onStatusChange(order.id, newStatus);
    } catch (e: any) {
      setError(e.message || 'Failed to update status.');
    } finally {
      setUpdating(false);
    }
  };

  const handleMarkPaid = async () => {
    setError('');
    setUpdating(true);
    try {
      await onMarkPaid(order.id);
    } catch (e: any) {
      setError(e.message || 'Failed to mark as paid.');
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
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : order.paymentStatus === 'refunded'
                ? 'bg-violet-50 text-violet-700 border-violet-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            )}>
              {order.paymentStatus === 'paid' ? '✓ Paid' : order.paymentStatus === 'refunded' ? 'Refunded' : '⏳ Unpaid'}
            </span>
          </div>

          {/* Pickup contact */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1">
              <User size={11} className="text-slate-400" />
              <strong className="text-slate-800">{order.pickupContact.fullName}</strong>
            </span>
            <span className="flex items-center gap-1">
              <Phone size={11} className="text-slate-400" />
              {order.pickupContact.phone}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} className="text-slate-400" />
              {formatDate(order.createdAt)}
            </span>
          </div>
          {order.pickupContact.notes && (
            <p className="text-[11px] text-slate-500 mt-1 italic">
              Note: {order.pickupContact.notes}
            </p>
          )}
        </div>

        {/* Total + expand */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-xs text-slate-500">Total</div>
            <div className="font-bold text-slate-900 flex items-center gap-0.5">
              <IndianRupee size={12} />
              {paiseToRupees(order.totalPaise)}
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
              Order Items ({order.items.length})
            </h4>
            <div className="space-y-2">
              {order.items.length > 0 ? order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-xs text-slate-700 bg-white rounded-xl px-3 py-2 border border-slate-200">
                  <span className="font-medium">{item.name} × {item.quantity}</span>
                  <span className="font-semibold text-slate-900">
                    ₹{paiseToRupees(item.unitPricePaise * item.quantity)}
                  </span>
                </div>
              )) : (
                <p className="text-xs text-slate-400">Item details not available.</p>
              )}
            </div>
          </div>

          {/* Status History */}
          {order.statusHistory && order.statusHistory.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Status History
              </h4>
              <div className="space-y-1.5">
                {order.statusHistory.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] text-slate-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
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

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              <AlertCircle size={13} />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          {(nextStatuses.length > 0 || canMarkPaid) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {updating ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 px-3 py-2">
                  <Loader2 size={14} className="animate-spin" />
                  Updating…
                </div>
              ) : (
                <>
                  {nextStatuses.map(s => {
                    const sc = STATUS_CONFIG[s];
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
                        → {sc.label}
                      </button>
                    );
                  })}
                  {canMarkPaid && (
                    <button
                      onClick={handleMarkPaid}
                      id={`order-${order.id}-mark-paid`}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white border border-emerald-700 hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
                    >
                      <IndianRupee size={12} />
                      Confirm Payment Received
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

/* ── Main Page ────────────────────────────────────────────────── */
export function OrdersListPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminOrders();
      setOrders(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders, refreshKey]);

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
            Click &amp; Collect orders — manage pickup statuses and confirm in-person payments
          </p>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-100 transition-colors disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
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
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            )}
          >
            <Filter size={10} />
            {label}
            {counts[key] > 0 && (
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

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2.5 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-rose-700 text-xs">
          <AlertCircle size={15} />
          <span>{error}</span>
          <button onClick={loadOrders} className="ml-auto underline text-rose-600">Retry</button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 size={28} className="animate-spin text-blue-500" />
            <span className="text-sm">Loading orders…</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl">
          <Package size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-600">No orders found</p>
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
