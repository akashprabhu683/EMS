import { Link, useLocation } from 'react-router-dom';
import {
  CheckCircle2, Package, ArrowRight, MapPin,
  Clock, ShieldCheck, Phone, FileText, Leaf,
} from 'lucide-react';
import { useState } from 'react';

interface OrderConfirmationState {
  orderId?: string;
  total?: number;
  subtotal?: number;
  orderStatus?: string;
  paymentStatus?: string;
  itemCount?: number;
  pickupName?: string;
  pickupPhone?: string;
}

const DISPENSARY_HOURS = 'Monday – Saturday: 9 AM – 7 PM  |  Sunday: Closed';

export function OrderConfirmationPage() {
  const location = useLocation();
  const state = (location.state as OrderConfirmationState) || {};

  const [fallbackRef] = useState(() => `EMS-${Math.floor(1_000_000 + Math.random() * 9_000_000)}`);
  const orderRef = state.orderId || fallbackRef;
  const total = state.total ?? 0;
  const itemCount = state.itemCount ?? 1;
  const pickupName = state.pickupName ?? 'Customer';
  const pickupPhone = state.pickupPhone ?? '';

  const statusLabel = (s?: string) => {
    switch (s) {
      case 'placed':          return 'Order Placed — Awaiting Acceptance';
      case 'accepted':        return 'Accepted by Dispensary';
      case 'preparing':       return 'Being Prepared';
      case 'ready_for_pickup': return 'Ready for Pickup!';
      case 'collected':       return 'Collected ✓';
      case 'cancelled':       return 'Cancelled';
      default:                return 'Order Placed';
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pt-16 pb-24 md:pb-10 flex items-start justify-center px-4">
      <div className="max-w-lg w-full space-y-4 mt-4">

        {/* Success Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-7 sm:p-9 text-center shadow-xs space-y-5">

          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto">
            <CheckCircle2 size={36} />
          </div>

          {/* Headline */}
          <div className="space-y-1.5">
            <span className="inline-block px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
              Order Placed — Click &amp; Collect
            </span>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              Order Confirmed!
            </h1>
            <p className="text-slate-500 text-sm leading-relaxed max-w-sm mx-auto">
              Thank you! Your herbal order has been received. We will prepare it and notify you when it is ready for collection.
            </p>
          </div>

          {/* Order Details */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left text-xs space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Order Reference</span>
              <span className="font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200 select-all">
                {orderRef}
              </span>
            </div>

            {total > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Order Total</span>
                <span className="font-bold text-emerald-700">₹{total.toFixed(0)}</span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-slate-500">Items</span>
              <span className="font-semibold text-slate-800">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500">Status</span>
              <span className="font-semibold text-emerald-700 flex items-center gap-1">
                <Package size={12} />
                {statusLabel(state.orderStatus)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500">Payment</span>
              <span className="font-semibold text-amber-700">
                💵 Pay at Pickup (Unpaid)
              </span>
            </div>

            {pickupName && (
              <div className="flex justify-between items-center pt-2 border-t border-slate-200/60">
                <span className="text-slate-500">Pickup Name</span>
                <span className="text-slate-800 font-medium">{pickupName}</span>
              </div>
            )}
            {pickupPhone && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Contact</span>
                <span className="text-slate-800 font-medium flex items-center gap-1">
                  <Phone size={10} />
                  {pickupPhone}
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <Link
              to="/orders"
              id="view-orders-btn"
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm"
            >
              <FileText size={14} />
              <span>Track Order</span>
            </Link>
            <Link
              to="/products"
              id="continue-shopping-link"
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-colors"
            >
              <Leaf size={14} />
              <span>Continue Shopping</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck size={12} className="text-emerald-500" />
            <span>Quality guaranteed · Natural &amp; authentic products</span>
          </div>
        </div>

        {/* Pickup Instructions Card */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5 space-y-4">
          <h2 className="font-display font-bold text-sm text-emerald-900 flex items-center gap-2">
            <MapPin size={15} className="text-emerald-600 shrink-0" />
            Pickup Instructions
          </h2>

          <div className="space-y-3 text-xs text-slate-700">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold shrink-0 mt-0.5">1</div>
              <div>
                <p className="font-semibold text-slate-800">Wait for Ready Notification</p>
                <p className="text-slate-500 mt-0.5 leading-relaxed">
                  We will update your order status to <strong>"Ready for Pickup"</strong> when prepared. Check your orders page or wait for contact via the phone number you provided.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold shrink-0 mt-0.5">2</div>
              <div>
                <p className="font-semibold text-slate-800">Visit the Dispensary</p>
                <p className="text-slate-500 mt-0.5 leading-relaxed">
                  Bring your <strong>order reference number ({orderRef})</strong> and collect your items from the counter.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 font-bold shrink-0 mt-0.5">3</div>
              <div>
                <p className="font-semibold text-slate-800">Pay at Counter</p>
                <p className="text-slate-500 mt-0.5 leading-relaxed">
                  Pay in person via cash or UPI. The shopkeeper will mark your order as <strong>Paid &amp; Collected</strong>.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-emerald-200 text-xs text-emerald-800">
            <Clock size={12} className="text-emerald-600 shrink-0" />
            <span>{DISPENSARY_HOURS}</span>
          </div>
        </div>

      </div>
    </main>
  );
}
