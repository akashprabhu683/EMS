import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Search, ChevronRight, CheckCircle2, Clock, ArrowRight, ShieldCheck, MapPin, Store, AlertCircle, Trash2, AlertTriangle, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { SEO } from '../components/SEO';
import { AppInstallBanner } from '../components/AppInstallBanner';
import {
  getUserOrders,
  subscribeUserOrders,
  deleteOrder,
  clearAllUserOrders,
  cancelCustomerOrder,
} from '../services/orderService';
import { downloadDispensaryReceipt } from '../services/receiptService';
import type { OrderStatus, Order } from '../types';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80';

export function OrdersPage() {
  const { user, isAuthenticated, signInWithGoogle } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const toast = useToast();

  const handleConfirmDeleteSingle = async () => {
    if (!orderToDelete) return;
    setIsDeleting(true);
    try {
      await deleteOrder(orderToDelete.id, user?.id);
      setOrders(prev => prev.filter(o => o.id !== orderToDelete.id));
      toast.success(`Order ${orderToDelete.id} hidden from your view.`);
      setOrderToDelete(null);
    } catch (err: any) {
      console.error('Failed to hide order:', err);
      toast.error(err.message || 'Could not hide order. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmClearAll = async () => {
    if (!user?.id) return;
    setIsDeleting(true);
    try {
      await clearAllUserOrders(user.id, orders.map(o => o.id));
      setOrders([]);
      toast.success('Your order history view has been cleared on this browser.');
      setShowClearAllModal(false);
    } catch (err: any) {
      console.error('Failed to clear orders:', err);
      toast.error(err.message || 'Could not clear order view. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Detect overdue orders: ready_for_pickup but not collected after >24 hours
  const overdueOrders = useMemo(() => {
    const now = Date.now();
    const OVERDUE_MS = 24 * 60 * 60 * 1000; // 24 hours
    return orders.filter(order => {
      if (order.status !== 'ready_for_pickup') return false;
      const placedDate = order.date ? new Date(order.date).getTime() : 0;
      if (!placedDate || isNaN(placedDate)) return false;
      return now - placedDate > OVERDUE_MS;
    });
  }, [orders]);

  const handleConfirmCancelOrder = async () => {
    if (!orderToCancel) return;
    setIsCancelling(true);
    try {
      await cancelCustomerOrder(orderToCancel.id);
      toast.success(`Order ${orderToCancel.id} has been cancelled.`);
      setOrderToCancel(null);
    } catch (err: any) {
      console.error('Failed to cancel order:', err);
      toast.error(err.message || 'Could not cancel order. Please contact dispensary staff.');
    } finally {
      setIsCancelling(false);
    }
  };

  useEffect(() => {
    if (!user?.id) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeUserOrders(
      user.id,
      (liveOrders) => {
        setOrders(Array.isArray(liveOrders) ? liveOrders : []);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to stream real-time orders:', err);
        toast.error('Real-time connection interrupted. Showing cached orders.');
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
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
    try {
      const { isPaidReceipt, filename } = downloadDispensaryReceipt(order);
      if (isPaidReceipt) {
        toast.success(`Dispensary payment receipt downloaded (${filename}).`);
      } else {
        toast.info(`Order confirmation downloaded (${filename}). Official payment receipt is issued upon collection at the counter.`);
      }
    } catch (err) {
      console.error('Failed to generate receipt:', err);
      toast.error('Could not generate receipt document. Please try again.');
    }
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
      <SEO
        title="My Orders & Collection Status"
        description="View your order status, preparation history, and 6-digit collection verification code."
        noindex={true}
      />
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

        {/* Mobile App & Real-Time Notification Alert Banner */}
        {isAuthenticated && <AppInstallBanner />}

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
            {/* Overdue Order Notification Banner */}
            {overdueOrders.length > 0 && (
              <div className="mb-6 bg-amber-50 border border-amber-300 rounded-2xl p-4 sm:p-5 flex items-start gap-4 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
                  <AlertCircle size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-amber-900 text-sm">
                    {overdueOrders.length === 1
                      ? 'You have 1 order awaiting collection'
                      : `You have ${overdueOrders.length} orders awaiting collection`}
                  </p>
                  <p className="text-amber-800 text-xs mt-0.5 leading-relaxed">
                    {overdueOrders.length === 1
                      ? <span>Order <strong className="text-amber-900">{overdueOrders[0].id}</strong> has been ready for pickup for over 24 hours. Please collect it at the dispensary counter as soon as possible.</span>
                      : <span>The following orders are ready but have not been collected within the expected window. Please visit the dispensary counter: <strong className="text-amber-900">{overdueOrders.map(o => o.id).join(', ')}</strong>.</span>
                    }
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {overdueOrders.slice(0, 3).map(o => (
                      <Link
                        key={o.id}
                        to={`/orders/${o.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold transition-colors"
                      >
                        <Package size={12} />
                        View Order {o.id}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
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

              {/* Search & Actions */}
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64 max-w-sm">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by ID or remedy..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 transition-all text-slate-800"
                  />
                </div>

                {orders.length > 0 && (
                  <button
                    onClick={() => setShowClearAllModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200 transition-colors shrink-0"
                    title="Clear your complete order history"
                  >
                    <Trash2 size={13} />
                    <span className="hidden sm:inline">Clear History</span>
                    <span className="sm:inline hidden">({orders.length})</span>
                    <span className="sm:hidden">Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Loading */}
            {loading && (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-xs text-slate-500 shadow-2xs">
                Loading your dispensary orders...
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
                        <div className="md:col-span-4 bg-emerald-50/60 border border-emerald-100 rounded-xl p-3.5 text-xs space-y-2">
                          <div className="flex items-center gap-1.5 text-emerald-800 font-bold mb-1">
                            <Store size={14} className="text-emerald-700" />
                            <span>Click & Collect Pickup</span>
                          </div>
                          <div className="text-slate-600 text-[11px]">
                            {order.pickupLocation || 'EMS Herbal & Ayurvedic Dispensary, Main Road Health Complex'}
                          </div>

                          {order.pickupCode && (
                            <div className="bg-emerald-100/80 border border-emerald-300/80 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Pickup PIN</span>
                              <span className="font-mono text-xs font-extrabold tracking-widest text-emerald-950 bg-white px-2 py-0.5 rounded shadow-2xs">
                                {order.pickupCode}
                              </span>
                            </div>
                          )}

                          <div className="flex justify-between items-center text-slate-500 pt-1.5 border-t border-emerald-200/50">
                            <span>Status:</span>
                            <span className="text-emerald-900 font-semibold">{order.estimatedDelivery || 'Within 2–4 hours'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions Footer */}
                      <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <ShieldCheck size={13} className="text-emerald-600" />
                          <span>100% Genuine Certified Herbal & Ayurvedic Formulations</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {order.status === 'placed' && (
                            <button
                              onClick={() => setOrderToCancel(order)}
                              className="inline-flex items-center gap-1.5 py-2 px-3 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200 transition-colors"
                              title="Cancel pending order"
                            >
                              <X size={13} />
                              <span>Cancel Order</span>
                            </button>
                          )}

                          <button
                            onClick={() => setOrderToDelete(order)}
                            className="inline-flex items-center gap-1.5 py-2 px-3 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
                            title="Remove this order from history"
                          >
                            <Trash2 size={13} />
                            <span>Remove</span>
                          </button>

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

      {/* Cancel Order Confirmation Modal */}
      {orderToCancel && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto">
              <AlertTriangle size={24} />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="font-display font-bold text-base text-slate-900">Cancel Order?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to cancel order <span className="font-mono font-bold text-slate-700">#{orderToCancel.id}</span>? Reserved stock will be returned to the dispensary catalog.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setOrderToCancel(null)}
                disabled={isCancelling}
                className="flex-1 py-2.5 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Keep Order
              </button>
              <button
                onClick={handleConfirmCancelOrder}
                disabled={isCancelling}
                className="flex-1 py-2.5 px-3 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-2xs disabled:opacity-50"
              >
                {isCancelling ? 'Cancelling…' : 'Yes, Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hide Single Order Confirmation Modal */}
      {orderToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto border border-amber-200">
              <Trash2 size={22} />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Hide Order from View?</h3>
              <p className="text-xs text-slate-500">
                This will hide order <span className="font-mono font-semibold text-slate-700">{orderToDelete.id}</span> from your order history on this browser. Authoritative records remain stored in the dispensary database.
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setOrderToDelete(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteSingle}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-800 text-white hover:bg-slate-900 transition-colors inline-flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isDeleting ? 'Hiding...' : 'Hide Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Orders Confirmation Modal */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto border border-amber-200">
              <AlertTriangle size={22} />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Clear Order History View?</h3>
              <p className="text-xs text-slate-500">
                This will hide all {orders.length} order records from your history view on this browser. Authoritative records remain safely preserved in the dispensary database.
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setShowClearAllModal(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClearAll}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-800 text-white hover:bg-slate-900 transition-colors inline-flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isDeleting ? 'Hiding...' : 'Hide All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
