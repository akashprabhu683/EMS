import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Package, ArrowRight, Download, ShieldCheck, FileText, Truck } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { downloadMockInvoice } from '../data/orders';

interface OrderConfirmationLocationState {
  orderId?: string;
  total?: number;
  subtotal?: number;
  shippingFee?: number;
  codFee?: number;
  paymentMethod?: string;
  orderStatus?: string;
  paymentStatus?: string;
  itemCount?: number;
  shippingName?: string;
  shippingAddress?: string;
}

export function OrderConfirmationPage() {
  const location = useLocation();
  const state = (location.state as OrderConfirmationLocationState) || {};
  const toast = useToast();

  const [fallbackOrderNumber] = useState(() => `NS-${Math.floor(1000000 + Math.random() * 9000000)}`);
  const orderNumber = state.orderId || fallbackOrderNumber;
  const isRealCodOrder = state.paymentMethod === 'cod';

  const handleDownloadInvoice = () => {
    downloadMockInvoice({
      id: orderNumber,
      date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      total: state.total || 349,
      items: [
        {
          product: { name: isRealCodOrder ? `Order Items (${state.itemCount || 1} units)` : 'AirPods Pro Max Ultra' },
          quantity: state.itemCount || 1,
          price: state.total || 349,
        },
      ],
      shippingAddress: {
        fullName: state.shippingName || 'Customer',
        street: state.shippingAddress || 'Address on file',
        city: 'India',
        state: 'IN',
      },
    });
    toast.success(`Invoice #${orderNumber} downloaded successfully.`);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pt-20 pb-16 flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 text-center shadow-xs space-y-6">
        {/* Success Icon */}
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto">
          <CheckCircle2 size={36} />
        </div>

        <div className="space-y-1">
          <span className="badge-clean bg-emerald-100 text-emerald-800 text-xs font-bold">
            {isRealCodOrder ? 'Order Placed — Cash on Delivery' : 'Payment Successful (Demo)'}
          </span>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
            Order Confirmed!
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm">
            Thank you for shopping with NovaShop. Your order has been registered in the database and is scheduled for dispatch.
          </p>
        </div>

        {/* Order Details Bento Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left text-xs space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Order Reference</span>
            <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 select-all">
              {orderNumber}
            </span>
          </div>
          {state.total !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Authoritative Total</span>
              <span className="font-bold text-blue-600">₹{state.total.toFixed(0)}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Payment Mode</span>
            <span className="font-semibold text-slate-800 flex items-center gap-1">
              {isRealCodOrder ? (
                <>
                  <Truck size={13} className="text-amber-600" /> Pay upon delivery (Cash / UPI at door)
                </>
              ) : (
                'Credit / Debit Card'
              )}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Order Status</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <Package size={13} /> {state.orderStatus ? `${state.orderStatus.toUpperCase()} — Processing` : 'Processing in Warehouse'}
            </span>
          </div>
          {state.shippingAddress && (
            <div className="flex justify-between items-start pt-1 border-t border-slate-200/60">
              <span className="text-slate-500 shrink-0">Deliver to</span>
              <span className="text-slate-700 text-right font-medium truncate max-w-[220px]">
                {state.shippingName} ({state.shippingAddress})
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            to="/orders"
            id="view-orders-btn"
            className="btn-primary flex-1 py-3 text-xs sm:text-sm rounded-xl justify-center"
          >
            <FileText size={15} />
            <span>View All Orders</span>
          </Link>
          <button
            id="download-receipt-btn"
            onClick={handleDownloadInvoice}
            className="btn-secondary flex-1 py-3 text-xs sm:text-sm rounded-xl justify-center"
          >
            <Download size={14} />
            <span>Download Invoice</span>
          </button>
        </div>

        <div>
          <Link
            to="/products"
            id="continue-shopping-link"
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
          >
            <span>Continue Browsing Catalog</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 pt-2">
          <ShieldCheck size={13} className="text-emerald-600" />
          <span>Full 30-day money back guarantee applies to this order</span>
        </div>
      </div>
    </main>
  );
}

