import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Search, ChevronRight, CheckCircle2, Clock, ArrowRight, ShieldCheck, MapPin, Store, AlertCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { getUserOrders } from '../services/orderService';
import type { OrderStatus, Order } from '../types';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80';

export function OrdersPage() {
  const { user, isAuthenticated, signInWithGoogle } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const toast = useToast();

  useEffect(() => {
    let active = true;
    if (user?.id) {
      setLoading(true);
      setError(null);
      getUserOrders(user.id)
        .then(res => {
          if (active) setOrders(Array.isArray(res) ? res : []);
        })
        .catch(err => {
          console.error('Failed to load orders:', err);
          if (active) setError('Could not load orders. Please try again.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => { active = false; };
  }, [user?.id]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (!order) return false;
      const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
      const query = searchQuery.trim().toLowerCase();
      if (!query) return matchesStatus;

      const orderIdMatch = String(order.id || '').toLowerCase().includes(query);
      const itemsMatch = Array.isArray(order.items) && order.items.some(i => {
        const name = (i?.product?.name || (i as any)?.name || '').toLowerCase();
        return name.includes(query);
      });
      const pickupMatch = (order.pickupLocation || '').toLowerCase().includes(query);

      return matchesStatus && (orderIdMatch || itemsMatch || pickupMatch);
    });
  }, [orders, filterStatus, searchQuery]);

  const handleDownloadInvoice = (order: Order, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toast.success(`Dispensary receipt for order ${order.id} downloaded.`);
  };

  const getStatusBadge = (status?: OrderStatus | string) => {
    const s = String(status || '').toLowerCase();
    switch (s) {
      case 'ready_for_pickup':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs">
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span>Ready for Pickup</span>
          </span>
        );
      case 'collected':
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 size={13} className="text-emerald-700" />
            <span>Collected ✓</span>
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
            <Clock size={13} className="text-teal-600" />
            <span>Accepted</span>
          </span>
        );
      case 'preparing':
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock size={13} className="text-amber-600 animate-pulse" />
            <span>Preparing</span>
          </span>
        );
      case 'shipped':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
            <span>In Transit</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <span>Cancelled</span>
          </span>
        );
      case 'placed':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Clock size={13} className="text-emerald-600" />
            <span>Order Placed</span>
          </span>
        );
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 overflow-x-clip">
      <div className="page-container py-8 sm:py-12">

        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-xs text-slate-500 mb-6" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-emerald-700 transition-colors">Home</Link>
          <span>/</span>
          <span className="text-slate-900 font-semibold">Orders</span>
        </nav>

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="badge-clean bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                Dispensary Orders
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900 tracking-tight">
              Order History & Collection
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              View preparation status, in-store pickup instructions, and purchase history.
            </p>
          </div>

          <Link
            to="/products"
            className="btn-primary py-2.5 px-5 text-xs sm:text-sm rounded-xl self-start sm:self-auto shrink-0 shadow-2xs"
          >
            <span>Explore Catalog</span>
            <ArrowRight size={15} />
          </Link>
        </div>

        {/* Unauthenticated State */}
        {!isAuthenticated && (
          <div className="bg-white border border-emerald-100 rounded-3xl p-8 sm:p-12 text-center shadow-xs max-w-lg mx-auto space-y-4 mb-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
              <Store size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Sign in to view your orders</h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Sign in with your Google account to track dispensary orders, preparation, and collection receipts.
            </p>
            <button
              onClick={() => signInWithGoogle().catch(console.error)}
              className="btn-primary py-2.5 px-6 rounded-xl text-xs sm:text-sm inline-flex items-center gap-2 mx-auto"
            >
              Sign In with Google
            </button>
          </div>
        )}

        {/* Authenticated Controls */}
        {isAuthenticated && (
          <>
            {/* Filter & Search Bar Controls */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              {/* Status Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                {[
                  { id: 'all', label: 'All Orders' },
                  { id: 'placed', label: 'Placed' },
                  { id: 'accepted', label: 'Accepted' },
                  { id: 'preparing', label: 'Preparing' },
                  { id: 'ready_for_pickup', label: 'Ready for Pickup' },
                  { id: 'collected', label: 'Collected' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setFilterStatus(tab.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                      filterStatus === tab.id
                        ? 'bg-emerald-700 text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search Input */}
              <div className="relative min-w-[240px] max-w-sm">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by order ID or remedy..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 transition-all text-slate-800"
                />
              </div>
            </div>

            {/* Loading */}
            {loading && (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-xs text-slate-500 shadow-2xs">
                Loading your dispensary orders...
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-700 flex items-center gap-2 mb-6">
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            {/* Orders Listing */}
            {!loading && filteredOrders.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-xs space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
                  <Package size={32} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">No orders found</h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
                  {searchQuery || filterStatus !== 'all'
                    ? "We couldn't locate any orders matching your search or filter."
                    : "You haven't placed any dispensary orders yet."}
                </p>
                <div className="flex justify-center gap-3 pt-2">
                  {(searchQuery || filterStatus !== 'all') && (
                    <button
                      onClick={() => { setFilterStatus('all'); setSearchQuery(''); }}
                      className="btn-secondary py-2.5 px-5 text-xs rounded-xl"
                    >
                      Reset Filters
                    </button>
                  )}
                  <Link
                    to="/products"
                    className="btn-primary py-2.5 px-5 text-xs rounded-xl"
                  >
                    Browse Remedies
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-4 sm:space-y-5">
                {filteredOrders.map(order => {
                  const itemsList = Array.isArray(order.items) ? order.items : [];
                  const totalFormatted = (Number(order.total) || 0).toFixed(2);
                  const isPaid = order.paymentStatus === 'paid';

                  return (
                    <div
                      key={order.id}
                      className="bento-card bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 sm:p-6 shadow-2xs transition-all"
                    >
                      {/* Order Top Meta */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-mono font-bold text-xs sm:text-sm text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/80">
                            {order.id}
                          </span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="text-xs text-slate-500 font-medium">
                            Placed on {order.date || 'Recent'}
                          </span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                            isPaid
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}>
                            {isPaid ? '✓ Paid' : '⏳ Pay at Dispensary'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          {getStatusBadge(order.status)}
                          <span className="text-sm sm:text-base font-bold text-slate-900 font-display">
                            ₹{totalFormatted}
                          </span>
                        </div>
                      </div>

                      {/* Items & Dispensary Collection Info */}
                      <div className="py-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                        {/* Items list column */}
                        <div className="md:col-span-8 space-y-3">
                          {itemsList.map((item, idx) => {
                            const pName = item?.product?.name || (item as any)?.name || 'Herbal Remedy';
                            const pImg = item?.product?.images?.[0] || FALLBACK_IMAGE;
                            const pPrice = Number(item?.price ?? item?.product?.price ?? 0).toFixed(2);
                            const pQty = Number(item?.quantity) || 1;
                            const pId = item?.product?.id || `item-${idx}`;

                            return (
                              <div key={idx} className="flex items-center gap-3.5">
                                <img
                                  src={pImg}
                                  alt={pName}
                                  className="w-14 h-14 rounded-xl object-cover bg-emerald-50/50 border border-slate-100 shrink-0"
                                  loading="lazy"
                                />
                                <div className="min-w-0 flex-1">
                                  <Link
                                    to={`/product/${pId}`}
                                    className="text-xs sm:text-sm font-semibold text-slate-900 hover:text-emerald-700 transition-colors truncate block"
                                  >
                                    {pName}
                                  </Link>
                                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                    <span>Qty: {pQty}</span>
                                    {item.selectedSize && <span>· Size: {item.selectedSize}</span>}
                                    <span>· ₹{pPrice} each</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Dispensary Pickup column */}
                        <div className="md:col-span-4 bg-emerald-50/60 border border-emerald-100 rounded-xl p-3.5 text-xs space-y-1.5">
                          <div className="flex items-center gap-1.5 text-emerald-800 font-bold mb-1">
                            <Store size={14} className="text-emerald-700" />
                            <span>Click & Collect Pickup</span>
                          </div>
                          <div className="text-slate-600 text-[11px]">
                            {order.pickupLocation || 'EMS Herbal & Ayurvedic Dispensary, Main Road Health Complex'}
                          </div>
                          <div className="flex justify-between items-center text-slate-500 pt-1.5 border-t border-emerald-200/50">
                            <span>Ready Estimate:</span>
                            <span className="text-emerald-900 font-semibold">{order.estimatedDelivery || 'Within 2-4 hours'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions Footer */}
                      <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <ShieldCheck size={13} className="text-emerald-600" />
                          <span>100% Genuine Certified Herbal & Ayurvedic Formulations</span>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <Link
                            to={`/orders/${order.id}`}
                            className="btn-secondary py-2 px-3 text-xs rounded-xl inline-flex items-center gap-1.5 hover:border-emerald-600 hover:text-emerald-700"
                          >
                            <span>View Details & Timeline</span>
                            <ChevronRight size={14} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      </div>
    </main>
  );
}
