import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft, CheckCircle2, MapPin, Phone, Clock,
  ShieldCheck, Leaf, Package, ChevronRight, User,
  AlertCircle, Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';

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
  const [orderError, setOrderError] = useState('');
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
    setOrderError('');
    if (!form.fullName.trim() || form.fullName.trim().length < 2) {
      setOrderError('Please enter your full name.');
      return false;
    }
    if (!form.phone.trim() || !/^[0-9+\s\-()]{7,20}$/.test(form.phone.trim())) {
      setOrderError('Please enter a valid phone number (at least 7 digits).');
      return false;
    }
    return true;
  };

  const handleGoogleSignIn = async () => {
    setGoogleSigningIn(true);
    setOrderError('');
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setOrderError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleSigningIn(false);
    }
  };

  const placeOrder = async () => {
    setOrderError('');

    if (!isAuthenticated) {
      setOrderError('Please sign in with Google to place your order.');
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

      const pickupContact = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim() || undefined,
      };

      if (apiUrl) {
        const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            pickupContact,
            idempotencyKey: idempotencyKeyRef.current,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}: Failed to place order.`);
        }

        const data = await res.json();
        orderId = data.orderId;
        totalPaise = data.totalPaise ?? data.total ?? 0;
        subtotalPaise = data.subtotalPaise ?? data.subtotal ?? 0;
        orderStatus = data.orderStatus ?? 'placed';
        paymentStatus = data.paymentStatus ?? 'unpaid';
        itemCount = data.itemCount ?? items.length;
      } else {
        // Fallback: Firebase Callable Function
        const createOrderCallable = httpsCallable<
          { pickupContact: typeof pickupContact; idempotencyKey: string },
          {
            orderId: string; subtotalPaise: number; total: number;
            orderStatus: string; paymentStatus: string; itemCount: number;
          }
        >(functions, 'createOrder');

        const response = await createOrderCallable({
          pickupContact,
          idempotencyKey: idempotencyKeyRef.current,
        });

        orderId = response.data.orderId;
        totalPaise = response.data.total;
        subtotalPaise = response.data.subtotalPaise;
        orderStatus = response.data.orderStatus;
        paymentStatus = response.data.paymentStatus;
        itemCount = response.data.itemCount;
      }

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
      setOrderError(err.message || 'Failed to place order. Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  /* ── Step navigation ── */
  const nextStep = () => {
    setOrderError('');
    if (step === 0) { setStep(1); return; }
    if (step === 1) {
      if (!validateContact()) return;
      if (!isAuthenticated) {
        setOrderError('Please sign in with Google before confirming your order.');
        return;
      }
      setStep(2);
    }
  };

  const prevStep = () => {
    setOrderError('');
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
    <main className="min-h-screen bg-slate-50 pb-24 md:pb-8">
      <div className="page-container pt-4 sm:pt-6 max-w-3xl mx-auto">

        {/* ── Back + Title ── */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => step > 0 ? prevStep() : navigate(-1)}
            className="p-2 rounded-xl text-slate-600 hover:bg-slate-200 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">Checkout</h1>
            <p className="text-xs text-slate-500">Click &amp; Collect — Pay at Dispensary</p>
          </div>
        </div>

        {/* ── Stepper ── */}
        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center flex-1">
              <div className="flex items-center gap-1.5">
                <div
                  className={clsx(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors',
                    i < step
                      ? 'bg-emerald-500 text-white'
                      : i === step
                      ? 'bg-emerald-600 text-white ring-2 ring-emerald-200'
                      : 'bg-slate-200 text-slate-400'
                  )}
                >
                  {i < step ? <CheckCircle2 size={12} /> : i + 1}
                </div>
                <span className={clsx(
                  'text-[11px] font-semibold hidden sm:inline',
                  i === step ? 'text-emerald-700' : i < step ? 'text-slate-500' : 'text-slate-400'
                )}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={clsx(
                  'flex-1 h-px mx-2',
                  i < step ? 'bg-emerald-400' : 'bg-slate-200'
                )} />
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* ── Main Panel ── */}
          <div className="lg:col-span-3 space-y-4">

            {/* STEP 0 — Cart Review */}
            {step === 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
                <h2 className="font-display font-bold text-base text-slate-900">Cart Review</h2>
                {items.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">Your cart is empty.</p>
                ) : (
                  <div className="space-y-3">
                    {items.map(({ product, quantity }) => (
                      <div key={product.id} className="flex items-start gap-3">
                        <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                          {product.images?.[0] ? (
                            <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">🌿</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{product.name}</p>
                          <p className="text-xs text-slate-500">Qty: {quantity}</p>
                        </div>
                        <span className="text-sm font-bold text-slate-900 shrink-0">
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
              <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
                <div>
                  <h2 className="font-display font-bold text-base text-slate-900">Your Pickup Details</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    We'll use this to notify you when your order is ready for collection.
                  </p>
                </div>

                {/* Auth Wall */}
                {!isAuthenticated ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
                      <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
                      Sign in to continue
                    </p>
                    <p className="text-xs text-emerald-800 leading-relaxed">
                      A quick Google sign-in is required to place your order.
                      Your cart will be preserved.
                    </p>
                    <button
                      id="checkout-google-signin-btn"
                      onClick={handleGoogleSignIn}
                      disabled={googleSigningIn}
                      className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-800 text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-60"
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
                      <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full border border-emerald-300" />
                    )}
                    <div>
                      <p className="text-xs font-bold text-emerald-900">{user?.name}</p>
                      <p className="text-[11px] text-emerald-700">{user?.email}</p>
                    </div>
                    <CheckCircle2 size={16} className="text-emerald-500 ml-auto shrink-0" />
                  </div>
                )}

                {/* Contact fields — always shown so user can pre-fill */}
                <div className="space-y-3">
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
                      className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
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
                      className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
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
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition resize-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 — Confirm & Place */}
            {step === 2 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
                <h2 className="font-display font-bold text-base text-slate-900">Confirm Your Order</h2>

                {/* Pickup summary */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
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
                    <div className="flex justify-between">
                      <span className="text-slate-500">Notes</span>
                      <span className="font-medium text-slate-800 text-right max-w-[200px]">{form.notes}</span>
                    </div>
                  )}
                </div>

                {/* Dispensary info */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-emerald-800 mb-1">
                    <MapPin size={13} className="text-emerald-600" />
                    Collection Point
                  </div>
                  <p className="font-semibold text-slate-900">{DISPENSARY.name}</p>
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Clock size={11} className="text-emerald-600 shrink-0" />
                    {DISPENSARY.hours}
                  </div>
                </div>

                {/* Payment notice */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="text-xl">💵</span>
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

            {/* Error */}
            {orderError && (
              <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-rose-700 text-xs">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{orderError}</span>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex gap-3">
              {step > 0 && (
                <button
                  onClick={prevStep}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-100 transition-colors"
                >
                  <ArrowLeft size={14} />
                  Back
                </button>
              )}

              {step < 2 ? (
                <button
                  id="checkout-next-btn"
                  onClick={nextStep}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold transition-colors shadow-sm"
                >
                  <span>{step === 0 ? 'Continue to Pickup Details' : 'Review Order'}</span>
                  <ChevronRight size={15} />
                </button>
              ) : (
                <button
                  id="checkout-place-order-btn"
                  onClick={placeOrder}
                  disabled={placing || !isAuthenticated}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-300 text-white text-sm font-bold transition-colors shadow-sm"
                >
                  {placing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Placing Order…</span>
                    </>
                  ) : (
                    <>
                      <Leaf size={15} />
                      <span>Place Order — Collect &amp; Pay at Shop</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* ── Order Summary Sidebar ── */}
          <aside className="lg:col-span-2">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sticky top-20 space-y-4">
              <h3 className="font-display font-bold text-sm text-slate-900 flex items-center gap-2">
                <Package size={15} className="text-emerald-600" />
                Order Summary
              </h3>

              <div className="space-y-2.5 text-xs">
                {items.map(({ product, quantity }) => (
                  <div key={product.id} className="flex justify-between text-slate-700">
                    <span className="truncate max-w-[130px]">{product.name} × {quantity}</span>
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
                  <span className="text-emerald-700">₹{totalDisplay}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">Pay in person at pickup — no online payment</p>
              </div>

              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-[11px] text-emerald-800 flex items-center gap-2">
                <ShieldCheck size={13} className="text-emerald-600 shrink-0" />
                <span>All products are quality verified and prepared fresh for your collection.</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
