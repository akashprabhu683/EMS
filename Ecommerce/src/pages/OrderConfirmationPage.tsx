import { Link } from 'react-router-dom';
import { CheckCircle2, Package, ArrowRight, Download, ShieldCheck, FileText } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { downloadMockInvoice } from '../data/orders';

export function OrderConfirmationPage() {
  const [orderNumber] = useState(() => `NS-${Math.floor(1000000 + Math.random() * 9000000)}`);
  const toast = useToast();

  const handleDownloadInvoice = () => {
    downloadMockInvoice({
      id: orderNumber,
      date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      total: 349,
      items: [
        {
          product: { name: 'AirPods Pro Max Ultra' },
          quantity: 1,
          price: 349,
        },
      ],
      shippingAddress: {
        fullName: 'Jane Doe',
        street: '742 Evergreen Terrace',
        city: 'Portland',
        state: 'OR',
      },
    });
    toast.success(`Invoice #${orderNumber} downloaded successfully.`);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pt-20 pb-16 flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 text-center shadow-xs space-y-6">
        {/* Clean Flat 2.0 Success Icon */}
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto">
          <CheckCircle2 size={36} />
        </div>

        <div className="space-y-1">
          <span className="badge-clean bg-emerald-100 text-emerald-800 text-xs font-bold">
            Payment Successful (Demo)
          </span>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
            Order Confirmed!
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm">
            Thank you for shopping with NovaShop. An order confirmation receipt and parcel tracking details have been generated.
          </p>
        </div>

        {/* Order Details Bento Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left text-xs space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Order Reference</span>
            <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
              {orderNumber}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Courier Delivery</span>
            <span className="font-semibold text-slate-800">2–4 Business Days (Express)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Order Status</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <Package size={13} /> Processing in Warehouse
            </span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
            <span className="text-slate-500">Demo Checkout</span>
            <span className="text-slate-600 font-medium">No real funds charged</span>
          </div>
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

