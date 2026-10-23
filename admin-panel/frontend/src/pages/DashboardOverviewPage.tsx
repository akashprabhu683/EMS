import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Plus,
  ShoppingBag,
  Clock,
  XCircle,
  IndianRupee,
  Users,
  ShieldCheck,
  User,
  Phone,
  RefreshCw,
  ExternalLink,
  BarChart3,
  History,
} from 'lucide-react';
import { getAllProducts } from '../services/adminProductService';
import { getAllCategories } from '../services/adminCategoryService';
import { subscribeAdminOrders, type AdminOrder } from '../services/adminOrderService';
import { useToast } from '../context/ToastContext';
import type { Product, Category } from '../types';

export function DashboardOverviewPage() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to real-time order stream (updates dynamically without page refresh)
  useEffect(() => {
    let active = true;

    async function loadCatalog() {
      try {
        const [prodList, catList] = await Promise.all([
          getAllProducts(),
          getAllCategories(),
        ]);
        if (active) {
          setProducts(prodList);
          setCategories(catList);
        }
      } catch (err: any) {
        if (active) {
          toast.error(err.message || 'Failed to load catalog metrics.');
        }
      }
    }

    loadCatalog();

    const unsubscribeOrders = subscribeAdminOrders(
      (liveOrders) => {
        if (active) {
          setOrders(liveOrders);
          setLoading(false);
        }
      },
      (err) => {
        console.error('Real-time order subscription error:', err);
        if (active) setLoading(false);
      }
    );

    return () => {
      active = false;
      unsubscribeOrders();
    };
  }, []);

  /* ── Order Metrics Computation ──────────────────────────────────── */
  const totalOrdersSinceEstablished = orders.length;

  const ordersPlacedCount = useMemo(
    () => orders.filter((o) => o.orderStatus === 'placed').length,
    [orders]
  );

  const newOrdersCount = useMemo(
    () => orders.filter((o) => o.orderStatus === 'placed' || o.orderStatus === 'accepted').length,
    [orders]
  );

  const completedOrdersCount = useMemo(
    () => orders.filter((o) => o.orderStatus === 'collected' || (o as any).orderStatus === 'delivered').length,
    [orders]
  );

  const overdueOrders = useMemo(() => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    return orders.filter((o) => {
      if (o.orderStatus !== 'ready_for_pickup') return false;
      const createdTime = new Date(o.createdAt).getTime();
      return now - createdTime > ONE_DAY_MS;
    });
  }, [orders]);

  const cancelledOrdersCount = useMemo(
    () => orders.filter((o) => o.orderStatus === 'cancelled').length,
    [orders]
  );

  const totalRevenuePaise = useMemo(
    () => orders.filter((o) => o.paymentStatus === 'paid').reduce((sum, o) => sum + (o.totalPaise || 0), 0),
    [orders]
  );

  /* ── Customer Aggregates ────────────────────────────────────────── */
  const uniqueCustomers = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; ordersCount: number; totalSpentPaise: number }>();
    for (const order of orders) {
      const contact = order.pickupContact || { fullName: 'Customer', phone: '—' };
      const key = order.userId || contact.phone || contact.fullName;
      const orderPaise = Number(order.totalPaise || order.subtotalPaise || 0);

      if (!map.has(key)) {
        map.set(key, {
          name: contact.fullName && contact.fullName !== '—' ? contact.fullName : 'Customer',
          phone: contact.phone && contact.phone !== '—' ? contact.phone : '—',
          ordersCount: 1,
          totalSpentPaise: orderPaise,
        });
      } else {
        const item = map.get(key)!;
        item.ordersCount += 1;
        item.totalSpentPaise += orderPaise;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.ordersCount - a.ordersCount);
  }, [orders]);

  /* ── Catalog Metrics ────────────────────────────────────────────── */
  const totalProducts = products.length;
  const activeProducts = products.filter((p) => p.isActive).length;
  const lowStockProducts = products.filter((p) => {
    const threshold = p.lowStockThreshold ?? 5;
    return p.stock > 0 && p.stock <= threshold;
  }).length;
  const outOfStockProducts = products.filter((p) => p.stock <= 0).length;
  const totalCategories = categories.length;
  const activeCategories = categories.filter((c) => c.isActive).length;

  const formatDate = (iso?: string) => {
    if (!iso) return 'Recent';
    try {
      return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return String(iso);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="w-8 h-8 border-3 border-emerald-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs font-semibold text-slate-500">Loading system overview and real-time stream...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Header with Live Real-Time Pulse */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-display">
              System Overview
            </h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Sync
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time orders pipeline, customer activity, and dispensary inventory telemetry
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/reports"
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-semibold rounded-xl flex items-center gap-2 shadow-2xs transition-colors"
          >
            <BarChart3 size={15} />
            <span>Reports</span>
          </Link>
          <Link
            to="/audit-logs"
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl flex items-center gap-2 shadow-2xs transition-colors"
          >
            <History size={15} className="text-slate-600" />
            <span>Audit Trail</span>
          </Link>
          <Link
            to="/orders"
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold rounded-xl flex items-center gap-2 shadow-2xs transition-colors"
          >
            <ShoppingBag size={15} />
            <span>Manage Orders</span>
          </Link>
          <Link
            to="/customers"
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl flex items-center gap-2 shadow-2xs transition-colors"
          >
            <Users size={15} className="text-emerald-700" />
            <span>Users &amp; Customers</span>
          </Link>
          <Link
            to="/profile"
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl flex items-center gap-2 shadow-2xs transition-colors"
          >
            <ShieldCheck size={15} className="text-emerald-700" />
            <span>Admin Profile</span>
          </Link>
        </div>
      </div>

      {/* Overdue Order Alert Banner (If Any) */}
      {overdueOrders.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-xs sm:text-sm text-amber-950">
                {overdueOrders.length === 1
                  ? '1 Click-and-Collect order is overdue for collection (>24 hours)'
                  : `${overdueOrders.length} Click-and-Collect orders are overdue for collection (>24 hours)`}
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                These remedies are ready at the dispensary counter but have not been collected by the customer.
              </p>
            </div>
          </div>
          <Link
            to="/orders"
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 transition-colors"
          >
            Review Orders
          </Link>
        </div>
      )}

      {/* Primary Order Metrics Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Orders Pipeline (Live Firestore Stream)
          </h2>
          <span className="text-[11px] text-slate-400 font-medium">Updates automatically without refresh</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {/* Total Orders Since Established */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Total Orders
              </span>
              <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <ShoppingBag size={14} />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display">
              {totalOrdersSinceEstablished}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Since established</p>
          </div>

          {/* New Orders */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-emerald-200/80 bg-emerald-50/20 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                New Orders
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Clock size={14} />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700 font-display">
              {newOrdersCount}
            </div>
            <p className="text-[10px] text-emerald-600 mt-1">Awaiting action</p>
          </div>

          {/* Orders Placed */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Orders Placed
              </span>
              <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                <Package size={14} />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-teal-700 font-display">
              {ordersPlacedCount}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Placed by customers</p>
          </div>

          {/* Completed Orders */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Completed
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 size={14} />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display">
              {completedOrdersCount}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Collected &amp; Paid</p>
          </div>

          {/* Order Overdue */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-amber-200 bg-amber-50/20 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                Overdue
              </span>
              <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <AlertTriangle size={14} />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-700 font-display">
              {overdueOrders.length}
            </div>
            <p className="text-[10px] text-amber-600 mt-1">&gt; 24h uncollected</p>
          </div>

          {/* Order Cancelled */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Cancelled
              </span>
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <XCircle size={14} />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-rose-600 font-display">
              {cancelledOrdersCount}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Cancelled by shop</p>
          </div>
        </div>
      </div>

      {/* Two-Column Layout: Live Orders Stream & Registered Users Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Orders Feed */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ShoppingBag size={17} className="text-emerald-700" />
              <h3 className="font-extrabold text-sm text-slate-900 font-display">
                Recent Orders (Live Stream)
              </h3>
            </div>
            <Link
              to="/orders"
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition-colors"
            >
              <span>View All</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          {orders.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">No orders recorded in system yet.</p>
          ) : (
            <div className="space-y-3">
              {orders.slice(0, 5).map((order) => (
                <div
                  key={order.id}
                  className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{order.id}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                        {order.orderStatus}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 truncate">
                      {order.pickupContact?.fullName || 'Customer'} · {order.items.length} item{order.items.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-slate-900 font-mono block">
                      ₹{((order.totalPaise || order.subtotalPaise || 0) / 100).toFixed(0)}
                    </span>
                    <span className="text-[10px] text-slate-400">{formatDate(order.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Users & Customers Directory Preview */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Users size={17} className="text-emerald-700" />
              <h3 className="font-extrabold text-sm text-slate-900 font-display">
                Users &amp; Customer Details
              </h3>
            </div>
            <Link
              to="/customers"
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition-colors"
            >
              <span>View All ({uniqueCustomers.length})</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          {uniqueCustomers.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">No customer profiles discovered yet.</p>
          ) : (
            <div className="space-y-3">
              {uniqueCustomers.slice(0, 5).map((cust, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0">
                      {cust.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{cust.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono truncate">{cust.phone}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-emerald-700 font-mono block">
                      ₹{(cust.totalSpentPaise / 100).toFixed(0)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {cust.ordersCount} order{cust.ordersCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Catalog & Inventory Metrics */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Dispensary Catalog &amp; Botanical Stock
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Total Products */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Total Products
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Package size={17} />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 font-display tracking-tight">
              {totalProducts}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {activeProducts} active in storefront
            </p>
          </div>

          {/* Active Products */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Live in Store
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 size={17} />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-emerald-600 font-display tracking-tight">
              {activeProducts}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {totalProducts - activeProducts} currently inactive
            </p>
          </div>

          {/* Low & Out of Stock Alerts */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Stock Alerts
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <AlertTriangle size={17} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-amber-600 font-display tracking-tight">
                {lowStockProducts}
              </span>
              {outOfStockProducts > 0 && (
                <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                  {outOfStockProducts} out of stock
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              ≤ configured threshold per item
            </p>
          </div>

          {/* Categories */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Categories
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Layers size={17} />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 font-display tracking-tight">
              {totalCategories}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {activeCategories} active categories
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
