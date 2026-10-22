import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Package, CheckCircle2, Clock, MapPin, Store, CreditCard, ShieldCheck, ExternalLink, Trash2, AlertTriangle, X } from 'lucide-react';
import { getOrderById, deleteOrder, subscribeOrderDetail, cancelCustomerOrder } from '../services/orderService';
import { useToast } from '../context/ToastContext';
import type { Order } from '../types';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80';

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeOrderDetail(
      orderId,
      (liveOrder) => {
        setOrder(liveOrder);
        setLoading(false);
      },
      (err) => {
        console.error('Real-time order subscription error:', err);
        // Fallback to one-time fetch
        getOrderById(orderId)
          .then((res) => setOrder(res))
          .finally(() => setLoading(false));
      }
    );

    return () => {
      unsubscribe();
    };
  }, [orderId]);

  const handleDownloadInvoice = () => {
    if (!order) return;
    toast.success(`Dispensary receipt for ${order.id} downloaded.`);
  };

  const handleViewLocation = () => {
    if (!order) return;
    toast.info(`Pickup Address: ${order.pickupLocation || 'EMS Herbal Dispensary, Main Road Health Complex'}`);
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    setIsCancelling(true);
    try {
      await cancelCustomerOrder(order.id);
      toast.success(`Order ${order.id} has been cancelled.`);
      setShowCancelModal(false);
    } catch (err: any) {
      console.error('Failed to cancel order:', err);
      toast.error(err.message || 'Could not cancel order. Please contact dispensary staff.');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!order) return;
    setIsDeleting(true);
    try {
      await deleteOrder(order.id);
      toast.success(`Order ${order.id} has been removed from your history.`);
      navigate('/orders');
    } catch (err: any) {
      console.error('Failed to remove order:', err);
      toast.error(err.message || 'Could not remove order. Please try again.');
      setIsDeleting(false);
    }
  };


  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 pb-20">
        <div className="page-container py-16 text-center text-sm text-slate-500">
          Loading order details...
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 pb-20">
        <div className="page-container py-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 mx-auto">
            <Package size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Order Not Found</h2>
          <p className="text-xs text-slate-500">The order ID could not be located in your history.</p>
          <Link to="/orders" className="btn-primary py-2.5 px-5 text-xs rounded-xl inline-flex mt-2">
            Back to Orders
          </Link>
        </div>
      </main>
    );
  }

  const itemsList = Array.isArray(order.items) ? order.items : [];
  const totalFormatted = (Number(order.total) || 0).toFixed(2);
  const subtotalFormatted = (Number(order.subtotal) || Number(order.total) || 0).toFixed(2);
  const isPaid = order.paymentStatus === 'paid';

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 overflow-x-clip">
      <div className="page-container py-8 sm:py-12">

        {/* Back navigation & breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <button
            onClick={() => navigate('/orders')}
            className="flex items-center gap-1.5 text-slate-500 hover:text-emerald-700 text-xs font-semibold transition-colors"
          >
            <ArrowLeft size={14} /> Back to all orders
          </button>

          <nav className="flex items-center gap-2 text-xs text-slate-500" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-emerald-700 transition-colors">Home</Link>
            <span>/</span>
            <Link to="/orders" className="hover:text-emerald-700 transition-colors">Orders</Link>
            <span>/</span>
            <span className="text-slate-900 font-semibold">{order.id}</span>
          </nav>
        </div>

        {/* Top Order Title & Header */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 mb-2">
              <span className="font-mono font-bold text-sm text-slate-900 bg-slate-100 px-3 py-1 rounded-xl border border-slate-200">
                {order.id}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                <CheckCircle2 size={13} className="text-emerald-600" />
                <span>{order.statusLabel || 'Order Registered'}</span>
              </span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                isPaid
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}>
                {isPaid ? '✓ Paid in Person' : '⏳ Unpaid · Pay at Shop'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900 tracking-tight">
              Order Details & Collection
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Order registered on <span className="font-medium text-slate-700">{order.date}</span> · {itemsList.length} item{itemsList.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-3">
            {order.status === 'placed' && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="inline-flex items-center gap-1.5 py-2.5 px-4 text-xs sm:text-sm rounded-xl font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors shadow-2xs"
              >
                <X size={15} />
                <span>Cancel Order</span>
              </button>
            )}
            <button
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center gap-1.5 py-2.5 px-4 text-xs sm:text-sm rounded-xl font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors shadow-2xs"
            >
              <Trash2 size={15} />
              <span>Remove Order</span>
            </button>
            <button
              id="download-order-invoice-btn"
              onClick={handleDownloadInvoice}
              className="btn-secondary py-2.5 px-4 text-xs sm:text-sm rounded-xl gap-2 shadow-2xs hover:border-emerald-600 hover:text-emerald-700"
            >
              <Download size={15} />
              <span>Download Receipt</span>
            </button>
            <button
              onClick={handleViewLocation}
              className="btn-primary py-2.5 px-4 text-xs sm:text-sm rounded-xl gap-2 shadow-2xs"
            >
              <Store size={15} />
              <span>Dispensary Directions</span>
            </button>
          </div>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Left Column (8 cols): Items & Timeline */}
          <div className="lg:col-span-8 space-y-6">

            {/* 6-Digit Counter Collection PIN Banner */}
            {order.pickupCode && (
              <div className="bg-emerald-50/90 border-2 border-dashed border-emerald-400 rounded-2xl p-5 text-center shadow-xs">
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-widest block mb-1">
                  Counter Collection Verification PIN
                </span>
                <div className="font-mono text-3xl sm:text-4xl font-extrabold tracking-widest text-emerald-950 my-1">
                  {order.pickupCode}
                </div>
                <p className="text-xs text-emerald-700 mt-1">
                  Please show this 6-digit PIN to the pharmacist at the dispensary counter to verify collection.
                </p>
              </div>
            )}

            {/* Preparation & Pickup Progress Timeline */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="font-display font-bold text-base text-slate-900">Dispensary Order Timeline</h2>
                  <p className="text-xs text-slate-500">Fulfillment: Click-and-Collect · Pickup Counter</p>
                </div>
                <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                  {order.estimatedDelivery || 'Ready within 2–4 hours'}
                </span>
              </div>


              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {(Array.isArray(order.timeline) ? order.timeline : []).map((step, idx) => (
                  <div key={idx} className="relative flex items-start gap-4">
                    <div
                      className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        step.completed
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white border-slate-300 text-slate-300'
                      }`}
                    >
                      {step.completed ? <CheckCircle2 size={12} /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />}
                    </div>

                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <h4 className={`text-xs sm:text-sm font-bold ${step.completed ? 'text-slate-900' : 'text-slate-400'}`}>
                          {step.title}
                        </h4>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {step.timestamp}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Items Ordered List */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="font-display font-bold text-base text-slate-900">Remedies Ordered</h2>
                <span className="text-xs text-slate-500 font-medium">
                  {itemsList.reduce((acc, i) => acc + (Number(i.quantity) || 1), 0)} items total
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {itemsList.map((item, idx) => {
                  const pName = item?.product?.name || (item as any)?.name || 'Herbal Formulation';
                  const pImg = item?.product?.images?.[0] || FALLBACK_IMAGE;
                  const pPrice = Number(item?.price ?? item?.product?.price ?? 0);
                  const pQty = Number(item?.quantity) || 1;
                  const pId = item?.product?.id || `item-${idx}`;

                  return (
                    <div key={idx} className="flex items-center gap-4 py-4 first:pt-1 last:pb-1">
                      <img
                        src={pImg}
                        alt={pName}
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover bg-emerald-50/50 border border-slate-100 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/product/${pId}`}
                          className="text-xs sm:text-sm font-bold text-slate-900 hover:text-emerald-700 transition-colors truncate block"
                        >
                          {pName}
                        </Link>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                          {item?.product?.description || 'Authentic herbal preparation'}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-2">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-medium">Qty: {pQty}</span>
                          {item.selectedSize && <span>Size: {item.selectedSize}</span>}
                          <span>Price: ₹{pPrice.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs sm:text-sm font-bold text-slate-900 font-display block">
                          ₹{(pPrice * pQty).toFixed(2)}
                        </span>
                        <Link
                          to={`/product/${pId}`}
                          className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 mt-1 inline-flex items-center gap-0.5"
                        >
                          View Remedy <ExternalLink size={10} />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Right Column (4 cols): Summary, Pickup & Payment */}
          <div className="lg:col-span-4 space-y-5">

            {/* Financial Summary Bento Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100">
                Payment Breakdown
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-900">₹{subtotalFormatted}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Dispensary Pickup Fee</span>
                  <span className="text-emerald-700 font-semibold">FREE</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-3 border-t border-slate-200">
                  <span>Total Payable</span>
                  <span className="text-emerald-700 font-display text-base">₹{totalFormatted}</span>
                </div>
              </div>

              {/* Status Notice */}
              <div className={`p-3 rounded-xl flex items-center gap-2 text-[11px] border ${
                isPaid
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                <ShieldCheck size={16} className={isPaid ? 'text-emerald-600' : 'text-amber-600'} />
                <span>
                  {isPaid
                    ? 'Payment Confirmed · Receipt Recorded'
                    : 'Payment due in person at dispensary counter upon collection'}
                </span>
              </div>
            </div>

            {/* Dispensary Pickup Location Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-wider">
                <Store size={14} className="text-emerald-700" />
                <span>Dispensary Pickup Details</span>
              </div>
              <div className="text-xs text-slate-600 space-y-1.5">
                <p className="font-bold text-slate-900">
                  {order.pickupContact?.fullName || order.shippingAddress?.fullName || 'Valued Customer'}
                </p>
                <p className="text-slate-700">
                  {order.pickupLocation || 'EMS Herbal & Ayurvedic Dispensary, Main Road Health Complex (Opp. City Wellness Center)'}
                </p>
                <p className="text-slate-500">
                  Phone: {order.pickupContact?.phone || order.shippingAddress?.phone || 'On file'}
                </p>
                <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">Counter Hours:</span> Mon–Sat 9:00 AM – 7:00 PM
                </div>
              </div>
            </div>

            {/* Payment Method Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-wider">
                <CreditCard size={14} className="text-emerald-700" />
                <span>Payment Settlement</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-800 font-medium">
                  <span>Pay in Person at Dispensary</span>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                  isPaid
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border-amber-200'
                }`}>
                  {isPaid ? 'PAID' : 'PAY AT COUNTER'}
                </span>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* Cancel Order Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
              <AlertTriangle size={22} />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Cancel Pending Order?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to cancel order <span className="font-mono font-semibold text-slate-700">{order.id}</span>? Reserved medicines will be immediately returned to catalog inventory.
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={isCancelling}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Keep Order
              </button>
              <button
                onClick={handleCancelOrder}
                disabled={isCancelling}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors inline-flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                {isCancelling ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Order Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
              <Trash2 size={22} />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Remove Order?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to remove order <span className="font-mono font-semibold text-slate-700">{order.id}</span> from your order history?
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteOrder}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors inline-flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isDeleting ? 'Removing...' : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
