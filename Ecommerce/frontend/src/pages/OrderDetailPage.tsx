import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Package, Truck, CheckCircle2, Clock, MapPin, CreditCard, ShieldCheck, ExternalLink } from 'lucide-react';
import { getOrderById, downloadMockInvoice, MOCK_ORDERS } from '../data/orders';
import { useToast } from '../context/ToastContext';

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const order = (orderId ? getOrderById(orderId) : undefined) || MOCK_ORDERS[0];

  const handleDownloadInvoice = () => {
    downloadMockInvoice(order);
    toast.success(`Invoice for ${order.id} downloaded successfully.`);
  };

  const handleTrackLive = () => {
    toast.info(`Tracking #${order.trackingNumber} is synchronized with ${order.courier} demo network.`);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 overflow-x-clip">
      <div className="page-container py-8 sm:py-12">

        {/* Back navigation & breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <button
            onClick={() => navigate('/orders')}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 text-xs font-semibold transition-colors"
          >
            <ArrowLeft size={14} /> Back to all orders
          </button>

          <nav className="flex items-center gap-2 text-xs text-slate-500" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-slate-900 transition-colors">Home</Link>
            <span>/</span>
            <Link to="/orders" className="hover:text-slate-900 transition-colors">Orders</Link>
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
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={13} className="text-emerald-600" />
                <span>{order.statusLabel}</span>
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900 tracking-tight">
              Order Details
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Order placed on <span className="font-medium text-slate-700">{order.date}</span> · {order.items.length} unique item{order.items.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              id="download-order-invoice-btn"
              onClick={handleDownloadInvoice}
              className="btn-secondary py-2.5 px-4 text-xs sm:text-sm rounded-xl gap-2 shadow-2xs"
            >
              <Download size={15} />
              <span>Download Invoice</span>
            </button>
            <button
              onClick={handleTrackLive}
              className="btn-primary py-2.5 px-4 text-xs sm:text-sm rounded-xl gap-2 shadow-2xs"
            >
              <Truck size={15} />
              <span>Live Tracking</span>
            </button>
          </div>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Left Column (8 cols): Items & Timeline */}
          <div className="lg:col-span-8 space-y-6">

            {/* Tracking Progress Timeline */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="font-display font-bold text-base text-slate-900">Shipment Timeline</h2>
                  <p className="text-xs text-slate-500">{order.courier} · Tracking: <span className="font-mono font-medium text-slate-700">{order.trackingNumber}</span></p>
                </div>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                  {order.estimatedDelivery}
                </span>
              </div>

              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {order.timeline.map((step, idx) => (
                  <div key={idx} className="relative flex items-start gap-4">
                    <div
                      className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        step.completed
                          ? 'bg-blue-600 border-blue-600 text-white'
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
                <h2 className="font-display font-bold text-base text-slate-900">Purchased Items</h2>
                <span className="text-xs text-slate-500 font-medium">{order.items.reduce((acc, i) => acc + i.quantity, 0)} items total</span>
              </div>

              <div className="divide-y divide-slate-100">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 py-4 first:pt-1 last:pb-1">
                    <img
                      src={item.product.images[0]}
                      alt={item.product.name}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover bg-slate-100 border border-slate-100 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/product/${item.product.id}`}
                        className="text-xs sm:text-sm font-bold text-slate-900 hover:text-blue-600 transition-colors truncate block"
                      >
                        {item.product.name}
                      </Link>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                        {item.product.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-2">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-medium">Qty: {item.quantity}</span>
                        {item.selectedSize && <span>Size: {item.selectedSize}</span>}
                        {item.selectedColor && (
                          <span className="flex items-center gap-1">
                            Color:
                            <span className="w-2.5 h-2.5 rounded-full border border-slate-300 inline-block" style={{ backgroundColor: item.selectedColor }} />
                          </span>
                        )}
                        <span>Price: ${item.price.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs sm:text-sm font-bold text-slate-900 font-display block">
                        ${(item.price * item.quantity).toFixed(2)}
                      </span>
                      <Link
                        to={`/product/${item.product.id}`}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 mt-1 inline-flex items-center gap-0.5"
                      >
                        Buy Again <ExternalLink size={10} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Right Column (4 cols): Financials, Shipping & Payment */}
          <div className="lg:col-span-4 space-y-5">

            {/* Financial Summary Bento Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100">
                Payment Summary
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-900">${order.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Express Shipping</span>
                  <span className={order.shipping === 0 ? 'text-emerald-700 font-semibold' : 'text-slate-900 font-semibold'}>
                    {order.shipping === 0 ? 'FREE' : `$${order.shipping.toFixed(2)}`}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Estimated Tax</span>
                  <span className="font-semibold text-slate-900">${order.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-3 border-t border-slate-200">
                  <span>Grand Total</span>
                  <span className="text-blue-600 font-display">${order.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Security Pill */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-center gap-2 text-[11px] text-emerald-800">
                <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                <span>Payment Verified · 100% Buyer Protection Guaranteed</span>
              </div>
            </div>

            {/* Delivery Address Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-wider">
                <MapPin size={14} className="text-blue-600" />
                <span>Delivery Address</span>
              </div>
              <div className="text-xs text-slate-600 space-y-1">
                <p className="font-bold text-slate-900">{order.shippingAddress.fullName}</p>
                <p>{order.shippingAddress.street}</p>
                <p>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}</p>
                <p>{order.shippingAddress.country}</p>
                {order.shippingAddress.phone && <p className="text-slate-500 mt-1">{order.shippingAddress.phone}</p>}
              </div>
            </div>

            {/* Payment Method Card with Demo Disclaimer */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-wider">
                <CreditCard size={14} className="text-blue-600" />
                <span>Payment Method</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-800 font-medium">
                  <span className="font-semibold">{order.paymentMethod.brand}</span>
                  <span className="text-slate-400">•••• {order.paymentMethod.last4}</span>
                </div>
                <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                  DEMO
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {order.paymentMethod.demoNote}. No credit card data or real currency is charged.
              </p>
            </div>

          </div>

        </div>

      </div>
    </main>
  );
}
