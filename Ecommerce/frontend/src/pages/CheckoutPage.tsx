import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ArrowLeft, CheckCircle2, MapPin, Phone, Clock,
  ShieldCheck, Leaf, Package, ChevronRight, User,
  Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

const STEPS = ['Cart Review', 'Pickup Details', 'Confirm & Place'];

const DISPENSARY = {
  name: 'EMS Herbal Dispensary',
  address: 'Visit us in store — address confirmed on signup',
  hours: 'Mon – Sat: 9 AM – 7 PM  |  Sun: Closed',
};

/* ════════════════════════════════════════════════════════════════════ */
export function CheckoutPage() {
  const { items, totalPrice, clearCart } = useCart();
  const { user, isAuthenticated, isLoading: authLoading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [placing, setPlacing] = useState(false);
  const toast = useToast();
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  // Reset idempotency key when cart changes
  useEffect(() => { idempotencyKeyRef.current = null; }, [items]);

  // Pickup contact form
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    notes: '',
  });

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      idempotencyKeyRef.current = null;
      setForm(f => ({ ...f, [k]: e.target.value }));
    };

  // Redirect to home if cart is empty (but not while auth is loading)
  useEffect(() => {
    if (!authLoading && items.length === 0 && step < 2) {
      navigate('/', { replace: true });
    }
  }, [items.length, authLoading, step, navigate]);

  // Pre-fill name from Google account
  useEffect(() => {
    if (isAuthenticated && user?.name && !form.fullName) {
      setForm(f => ({ ...f, fullName: user.name }));
    }
  }, [isAuthenticated, user?.name]);

  const validateContact = (): boolean => {
    if (!form.fullName.trim() || form.fullName.trim().length < 2) {
      toast.warning('Please enter your full name.');
      return false;
    }
    if (!form.phone.trim() || !/^[0-9+\s\-()]{7,20}$/.test(form.phone.trim())) {
      toast.warning('Please enter a valid phone number (at least 7 digits).');
      return false;
    }
    return true;
  };

  const handleGoogleSignIn = async () => {
    setGoogleSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      toast.error(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleSigningIn(false);
    }
  };

  const placeOrder = async () => {
    if (!isAuthenticated) {
      toast.warning('Please sign in with Google to place your order.');
      return;
    }

    if (!validateContact()) return;

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    setPlacing(true);

    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      let orderId = '';
      let totalPaise = 0;
      let subtotalPaise = 0;
      let orderStatus = 'placed';
      let paymentStatus = 'unpaid';
      let itemCount = items.length;

      const pickupContact: { fullName: string; phone: string; notes?: string } = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
      };
      if (form.notes && form.notes.trim()) {
        pickupContact.notes = form.notes.trim();
      }

      const currentUid = auth.currentUser?.uid || user?.id;
      if (!currentUid) {
        throw new Error('Please sign in with Google to place your order.');
      }

      const calculatedTotalPaise = Math.round(totalPrice * 100);
      const orderItems = items.map(item => ({
        productId: item.product.id || '',
        name: item.product.name || 'Herbal Product',
        unitPrice: Math.round((item.product.price || 0) * 100),
        quantity: item.quantity || 1,
        lineTotal: Math.round((item.product.price || 0) * (item.quantity || 1) * 100),
        imageUrl: (item.product.images && item.product.images[0]) || '',
        selectedColor: item.selectedColor || null,
        selectedSize: item.selectedSize || null,
      }));

      // Directly create order in live Firestore orders collection
      const orderDocRef = await addDoc(collection(db, 'orders'), {
        userId: currentUid,
        orderStatus: 'placed',
        paymentStatus: 'unpaid',
        paymentMethod: 'click_and_collect',
        fulfillmentMethod: 'click_and_collect',
        pickupContact,
        pickupLocation: 'EMS Herbal & Ayurvedic Dispensary, Main Road Health Complex (Opp. City Wellness Center), Pin: 560001',
        items: orderItems,
        subtotal: calculatedTotalPaise,
        total: calculatedTotalPaise,
        shippingFee: 0,
        codFee: 0,
        itemCount: items.length,
        statusHistory: [
          {
            status: 'placed',
            timestamp: new Date().toISOString(),
            note: 'Order placed for Click-and-Collect dispensary pickup. Awaiting dispensary confirmation.',
          },
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      orderId = orderDocRef.id;
      totalPaise = calculatedTotalPaise;
      subtotalPaise = calculatedTotalPaise;
      orderStatus = 'placed';
      paymentStatus = 'unpaid';
      itemCount = items.length;

      clearCart();

      navigate('/order-confirmation', {
        state: {
          orderId,
          total: totalPaise / 100,
          subtotal: subtotalPaise / 100,
          orderStatus,
          paymentStatus,
          itemCount,
          pickupName: pickupContact.fullName,
          pickupPhone: pickupContact.phone,
        },
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to place order. Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  /* ── Step navigation ── */
  const nextStep = () => {
    if (step === 0) { setStep(1); return; }
    if (step === 1) {
      if (!validateContact()) return;
      if (!isAuthenticated) {
        toast.error('Please sign in with Google before confirming your order.');
        return;
      }
      setStep(2);
    }
  };

  const prevStep = () => {
    setStep(s => Math.max(0, s - 1));
  };

  /* ── Loading state ── */
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={32} className="animate-spin text-emerald-600" />
      </div>
    );
  }

  const total = totalPrice; // No shipping or COD fee — Click-and-Collect (price already in rupees)
  const totalDisplay = total.toFixed(0);

  /* ══════════════════════════════════════════════════════════════════ */
  return (
    <main className="min-h-screen bg-slate-50 pb-16 sm:pb-24">
      <div className="page-container px-3.5 sm:px-6 pt-3 sm:pt-6 max-w-4xl lg:max-w-5xl mx-auto">

        {/* ── Back + Title ── */}
        <div className="flex items-center gap-2.5 sm:gap-3 mb-4 sm:mb-6">
          <button
            onClick={() => step > 0 ? prevStep() : navigate(-1)}
            className="p-2 sm:p-2.5 rounded-xl text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="font-display font-extrabold text-lg sm:text-2xl text-slate-900 truncate">Checkout</h1>
            <p className="text-xs text-slate-500 truncate">Click &amp; Collect — Pay in Person at Dispensary</p>
          </div>
        </div>

        {/* ── Stepper ── */}
        <div className="mb-6 sm:mb-8 bg-white border border-slate-200/80 rounded-2xl p-3 sm:p-4 shadow-2xs">
          {/* Mobile Current Step Tagline */}
          <div className="sm:hidden flex items-center justify-between text-xs font-semibold text-slate-700 mb-2.5 pb-2 border-b border-slate-100">
            <span className="text-slate-600">Step {step + 1} of 3: <strong className="text-emerald-700">{STEPS[step]}</strong></span>
            <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">₹{totalDisplay}</span>
          </div>

          <div className="flex items-center gap-1">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center flex-1">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div
                    className={clsx(
                      'w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold transition-all shrink-0',
                      i < step
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : i === step
                        ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 shadow-2xs'
                        : 'bg-slate-200 text-slate-400'
                    )}
                  >
                    {i < step ? <CheckCircle2 size={13} /> : i + 1}
                  </div>
                  <span className={clsx(
                    'text-[11px] sm:text-xs font-semibold hidden sm:inline transition-colors',
                    i === step ? 'text-emerald-800 font-bold' : i < step ? 'text-slate-600' : 'text-slate-400'
                  )}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={clsx(
                    'flex-1 h-0.5 mx-1.5 sm:mx-3 rounded-full transition-colors',
                    i < step ? 'bg-emerald-500' : 'bg-slate-200'
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">

          {/* ── Main Panel ── */}
          <div className="lg:col-span-3 space-y-4">

            {/* STEP 0 — Cart Review */}
            {step === 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4 shadow-2xs">
                <h2 className="font-display font-bold text-base text-slate-900">Cart Review</h2>
                {items.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">Your cart is empty.</p>
                ) : (
                  <div className="space-y-3 divide-y divide-slate-100">
                    {items.map(({ product, quantity }) => (
                      <div key={product.id} className="pt-3 first:pt-0 flex items-center gap-3">
                        <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                          {product.images?.[0] ? (
                            <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">🌿</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{product.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">Qty: {quantity} × ₹{product.price.toFixed(0)}</p>
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-slate-900 shrink-0">
                          ₹{(product.price * quantity).toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* STEP 1 — Pickup Contact */}
            {step === 1 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xs">
                <div>
                  <h2 className="font-display font-bold text-base text-slate-900">Your Pickup Details</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    We will notify this contact when your remedies are prepared for collection.
                  </p>
                </div>

                {/* Auth Wall */}
                {!isAuthenticated ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-3">
                    <p className="text-xs sm:text-sm font-semibold text-emerald-900 flex items-center gap-2">
                      <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                      Sign in to continue
                    </p>
                    <p className="text-xs text-emerald-800 leading-relaxed">
                      A quick Google sign-in is required to place your order. Your cart and details will be preserved.
                    </p>
                    <button
                      id="checkout-google-signin-btn"
                      onClick={handleGoogleSignIn}
                      disabled={googleSigningIn}
                      className="w-full h-11 flex items-center justify-center gap-2.5 px-4 rounded-xl bg-white border border-slate-200 text-slate-800 text-xs sm:text-sm font-semibold hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-60"
                    >
                      {googleSigningIn ? (
                        <Loader2 size={16} className="animate-spin text-emerald-600" />
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
                          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
                          <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"/>
                          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z"/>
                        </svg>
                      )}
                      <span>{googleSigningIn ? 'Signing in…' : 'Continue with Google'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
                    {user?.avatar && (
                      <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full border border-emerald-300 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-emerald-900 truncate">{user?.name}</p>
                      <p className="text-[11px] text-emerald-700 truncate">{user?.email}</p>
                    </div>
                    <CheckCircle2 size={16} className="text-emerald-600 ml-auto shrink-0" />
                  </div>
                )}

                {/* Contact fields — always shown so user can pre-fill */}
                <div className="space-y-3.5">
                  <div>
                    <label htmlFor="pickup-name" className="block text-xs font-semibold text-slate-700 mb-1">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="pickup-name"
                      type="text"
                      value={form.fullName}
                      onChange={set('fullName')}
                      placeholder="Your name for pickup"
                      className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-200 text-base sm:text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
                    />
                  </div>
                  <div>
                    <label htmlFor="pickup-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                      Phone Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="pickup-phone"
                      type="tel"
                      value={form.phone}
                      onChange={set('phone')}
                      placeholder="+91 98765 43210"
                      className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-200 text-base sm:text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
                    />
                  </div>
                  <div>
                    <label htmlFor="pickup-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                      Notes <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      id="pickup-notes"
                      value={form.notes}
                      onChange={set('notes')}
                      placeholder="Preferred pickup time, special requests…"
                      rows={2}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base sm:text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition resize-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 — Confirm & Place */}
            {step === 2 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xs">
                <h2 className="font-display font-bold text-base text-slate-900">Confirm Your Order</h2>

                {/* Pickup summary */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-slate-800 mb-1">
                    <User size={13} className="text-emerald-600" />
                    Pickup Contact
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Name</span>
                    <span className="font-medium text-slate-800">{form.fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Phone</span>
                    <span className="font-medium text-slate-800">{form.phone}</span>
                  </div>
                  {form.notes && (
                    <div className="flex justify-between items-start gap-2 pt-1 border-t border-slate-100">
                      <span className="text-slate-500 shrink-0">Notes</span>
                      <span className="font-medium text-slate-800 text-right">{form.notes}</span>
                    </div>
                  )}
                </div>

                {/* Dispensary info */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 sm:p-4 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 font-bold text-emerald-800 mb-1">
                    <MapPin size={13} className="text-emerald-600" />
                    Collection Point
                  </div>
                  <p className="font-semibold text-slate-900">{DISPENSARY.name}</p>
                  <div className="flex items-center gap-1.5 text-slate-600 text-[11px] sm:text-xs">
                    <Clock size={12} className="text-emerald-600 shrink-0" />
                    <span>{DISPENSARY.hours}</span>
                  </div>
                </div>

                {/* Payment notice */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 sm:p-4 text-xs">
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl shrink-0">💵</span>
                    <div>
                      <p className="font-bold text-amber-900">Pay In Person at Pickup</p>
                      <p className="text-amber-800 mt-0.5 leading-relaxed">
                        No online payment is required now. Pay with cash or UPI when you collect your order at our dispensary.
                        Your order status will show <strong>Unpaid</strong> until the shop confirms receipt.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center gap-2.5 sm:gap-3 pt-1">
              {step > 0 && (
                <button
                  onClick={prevStep}
                  className="h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-50 active:bg-slate-100 transition-all flex items-center justify-center gap-1.5 shrink-0 shadow-2xs"
                >
                  <ArrowLeft size={15} />
                  <span>Back</span>
                </button>
              )}

              {step < 2 ? (
                <button
                  id="checkout-next-btn"
                  onClick={nextStep}
                  className="h-11 sm:h-12 flex-1 flex items-center justify-center gap-2 px-4 sm:px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs sm:text-sm font-semibold transition-all shadow-sm"
                >
                  <span>{step === 0 ? 'Continue to Pickup Details' : 'Review & Confirm'}</span>
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  id="checkout-place-order-btn"
                  onClick={placeOrder}
                  disabled={placing || !isAuthenticated}
                  className="h-11 sm:h-12 flex-1 flex items-center justify-center gap-2 px-3 sm:px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-300 text-white text-xs sm:text-sm md:text-base font-bold transition-all shadow-sm"
                >
                  {placing ? (
                    <>
                      <Loader2 size={16} className="animate-spin shrink-0" />
                      <span>Placing Order…</span>
                    </>
                  ) : (
                    <>
                      <Leaf size={16} className="shrink-0" />
                      <span className="truncate">
                        <span className="sm:hidden">Place Order (₹{totalDisplay})</span>
                        <span className="hidden sm:inline">Place Order — Collect &amp; Pay at Shop</span>
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* ── Order Summary Sidebar ── */}
          <aside className="lg:col-span-2">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 lg:sticky lg:top-20 space-y-4 shadow-2xs">
              <h3 className="font-display font-bold text-sm text-slate-900 flex items-center gap-2">
                <Package size={15} className="text-emerald-600" />
                Order Summary
              </h3>

              <div className="space-y-2.5 text-xs">
                {items.map(({ product, quantity }) => (
                  <div key={product.id} className="flex justify-between items-center text-slate-700">
                    <span className="truncate max-w-[170px] sm:max-w-[220px]">{product.name} × {quantity}</span>
                    <span className="font-semibold shrink-0 ml-2">₹{(product.price * quantity).toFixed(0)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>₹{totalDisplay}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Delivery / Shipping</span>
                  <span className="text-emerald-600 font-semibold">Collect in Store</span>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <div className="flex justify-between font-bold text-sm text-slate-900">
                  <span>Total</span>
                  <span className="text-emerald-700 text-base">₹{totalDisplay}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">Pay in person at pickup — no online payment</p>
              </div>

              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-[11px] text-emerald-800 flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
                <span>All products are quality verified and prepared fresh for your collection.</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
