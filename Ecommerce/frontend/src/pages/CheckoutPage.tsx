import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft, CreditCard, Lock, CheckCircle2, Package,
  ChevronRight, ShieldCheck, Smartphone, QrCode,
  Building2, Truck, Clock, RefreshCw, Wifi, AlertCircle
} from 'lucide-react';
import clsx from 'clsx';
import type { PaymentMethodId, CheckoutPaymentInfo } from '../types';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';

const STEPS = ['Cart Review', 'Shipping Info', 'Payment', 'Confirmation'];

/* ────────────────── UPI app logos (SVG inline badges) ────────────────── */
const UPI_APPS = [
  { id: 'gpay', label: 'GPay', color: '#4285F4', letter: 'G' },
  { id: 'phonepe', label: 'PhonePe', color: '#5F259F', letter: 'Ph' },
  { id: 'paytm', label: 'Paytm', color: '#00BAF2', letter: 'Py' },
  { id: 'bhim', label: 'BHIM', color: '#004C97', letter: 'B' },
];

const BANKS = [
  'State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank',
  'Kotak Mahindra Bank', 'Bank of Baroda', 'Punjab National Bank',
  'Canara Bank', 'IndusInd Bank', 'Yes Bank',
];

/* ────────────────── Mock QR SVG ────────────────── */
function MockQRCode({ size = 140 }: { size?: number }) {
  // Simple deterministic QR-like pattern for demo
  const cells = 21;
  const cellSize = size / cells;
  const pattern: boolean[][] = Array.from({ length: cells }, (_, r) =>
    Array.from({ length: cells }, (_, c) => {
      // Finder patterns (corners)
      const inFinder = (
        (r < 8 && c < 8) || (r < 8 && c >= cells - 8) || (r >= cells - 8 && c < 8)
      );
      if (inFinder) {
        const edgeRow = r === 0 || r === 6 || r === 7;
        const edgeCol = c === 0 || c === 6 || c === 7;
        const innerRow = r >= 2 && r <= 4;
        const innerCol = c >= 2 && c <= 4;
        // Right finder
        const r2 = c >= cells - 8 ? c - (cells - 8) : c;
        const edgeCol2 = r2 === 0 || r2 === 6;
        const innerCol2 = r2 >= 2 && r2 <= 4;
        return edgeRow || edgeCol || innerRow && innerCol;
      }
      // Timing patterns
      if (r === 6 || c === 6) return (r + c) % 2 === 0;
      // Data cells – pseudo-random via position
      return ((r * 7 + c * 13 + r * c) % 3) !== 0;
    })
  );

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="Mock QR code for demo">
      <rect width={size} height={size} fill="white" rx="8" />
      {pattern.map((row, r) =>
        row.map((filled, c) =>
          filled ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize + 1}
              y={r * cellSize + 1}
              width={cellSize - 1}
              height={cellSize - 1}
              fill="#1a1a2e"
              rx="0.5"
            />
          ) : null
        )
      )}
    </svg>
  );
}

/* ────────────────── Countdown timer hook ────────────────── */
function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (remaining <= 0) { setExpired(true); return; }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);
  const reset = () => { setRemaining(seconds); setExpired(false); };
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  return { display: `${mm}:${ss}`, expired, reset };
}

/* ═══════════════════════════════════════════════════════════════════════ */
export function CheckoutPage() {
  const { items, totalPrice, clearCart } = useCart();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState('');
  const idempotencyKeyRef = useRef<string | null>(null);

  // Invalidate idempotency key if cart items change
  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [items]);

  // Shipping form
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    address: '', city: '', state: '', zip: '', country: 'IN',
    saveAddress: false,
  });

  // Payment state - Cash on Delivery is the supported live backend method
  const [payMethod, setPayMethod] = useState<PaymentMethodId>('cod');
  const [upiTab, setUpiTab] = useState<'qr' | 'id' | 'apps'>('qr');
  const [upiId, setUpiId] = useState('');
  const [selectedApp, setSelectedApp] = useState('');
  const [selectedBank, setSelectedBank] = useState('');
  // Card fields (masked placeholders, never persisted)
  const [cardName, setCardName] = useState('');
  const [cardNum, setCardNum] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  // Payment info snapshot for confirmation
  const [payInfo, setPayInfo] = useState<CheckoutPaymentInfo | null>(null);

  const hasPrepaidOnly = items.some(i => i.product.prepaidOnly);
  const shipping = totalPrice >= 999 ? 0 : 49;
  const codFee = 49;

  // Must match the backend pricing contract; amounts are displayed in rupees.
  const total = totalPrice + shipping + (payMethod === 'cod' ? codFee : 0);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    idempotencyKeyRef.current = null;
    setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
  };

  const upiCountdown = useCountdown(300); // 5 min UPI QR expiry

  /* ── Capture payment info snapshot before going to step 3 ── */
  const capturePayInfo = () => {
    let label = 'UPI';
    let info: CheckoutPaymentInfo = {
      method: payMethod, methodLabel: 'UPI',
      codFee: 0, totalWithCod: total,
      confirmationStatus: 'demo_confirmed',
    };
    if (payMethod === 'upi') {
      if (upiTab === 'qr') label = 'UPI — QR Code';
      if (upiTab === 'id') label = `UPI — ${upiId || 'yourname@upi'}`;
      if (upiTab === 'apps') label = `UPI — ${selectedApp || 'App'}`;
      info = { ...info, methodLabel: label, upiOption: upiTab, upiId, upiApp: selectedApp };
    } else if (payMethod === 'card') {
      label = `Card ending ${cardNum.replace(/\s/g, '').slice(-4) || '••••'}`;
      info = { ...info, methodLabel: label };
    } else if (payMethod === 'netbanking') {
      label = selectedBank || 'Net Banking';
      info = { ...info, methodLabel: label, bankName: selectedBank };
    } else if (payMethod === 'cod') {
      label = 'Cash on Delivery';
      info = { ...info, methodLabel: label, codFee, totalWithCod: total };
    }
    setPayInfo(info);
  };

  const validateShipping = () => {
    const name = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
    if (!name) {
      setOrderError('Please enter your full recipient name.');
      return false;
    }
    if (!form.phone.trim() || !/^[0-9+\s\-()]{7,20}$/.test(form.phone.trim())) {
      setOrderError('Please enter a valid phone number (at least 7 digits).');
      return false;
    }
    if (!form.address.trim() || form.address.trim().length < 3) {
      setOrderError('Please enter a valid street delivery address.');
      return false;
    }
    if (!form.city.trim()) {
      setOrderError('Please enter your city.');
      return false;
    }
    if (!form.state.trim()) {
      setOrderError('Please select your state.');
      return false;
    }
    if (!form.zip.trim() || !/^[0-9]{6}$/.test(form.zip.trim())) {
      setOrderError('Please enter a valid 6-digit Indian PIN code.');
      return false;
    }
    setOrderError('');
    return true;
  };

  const placeOrder = async () => {
    setOrderError('');

    if (!isAuthenticated) {
      navigate('/login', { state: { from: '/checkout' } });
      return;
    }

    if (payMethod !== 'cod') {
      setOrderError(
        'Online payments are coming soon in Phase 3. Please select Cash on Delivery to place your order.'
      );
      return;
    }

    if (hasPrepaidOnly) {
      setOrderError(
        'Cash on Delivery is unavailable for one or more prepaid-only products in your cart.'
      );
      return;
    }

    if (!validateShipping()) {
      return;
    }

    const name = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
    setPlacing(true);

    // Keep the same key if the request is retried after a network error for identical parameters.
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      let order: {
        orderId: string;
        subtotal: number;
        shippingFee: number;
        codFee: number;
        total: number;
        orderStatus: string;
        paymentStatus: string;
        paymentMethod: string;
        itemCount: number;
      };

      const shippingAddressPayload = {
        name,
        phone: form.phone.trim(),
        line1: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        postalCode: form.zip.trim(),
        country: form.country || 'IN',
      };

      if (apiUrl) {
        // Use Render Backend API
        const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        const apiRes = await fetch(`${apiUrl.replace(/\/$/, '')}/api/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            shippingAddress: shippingAddressPayload,
            idempotencyKey: idempotencyKeyRef.current,
            paymentMethod: 'cod',
          }),
        });

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${apiRes.status}: Failed to place order.`);
        }

        const data = await apiRes.json();
        order = {
          orderId: data.orderId,
          subtotal: data.subtotalPaise || data.subtotal,
          shippingFee: data.shippingFeePaise || data.shippingFee,
          codFee: data.codFeePaise || data.codFee,
          total: data.totalPaise || data.total,
          orderStatus: data.orderStatus,
          paymentStatus: data.paymentStatus,
          paymentMethod: data.paymentMethod,
          itemCount: data.itemCount,
        };
      } else {
        // Fallback to Firebase Callable Function
        const createOrderCallable = httpsCallable<
          {
            shippingAddress: typeof shippingAddressPayload;
            idempotencyKey: string;
            paymentMethod: string;
          },
          {
            orderId: string;
            subtotal: number;
            shippingFee: number;
            codFee: number;
            total: number;
            orderStatus: string;
            paymentStatus: string;
            paymentMethod: string;
            itemCount: number;
            createdAt: string;
          }
        >(functions, 'createOrder');

        const response = await createOrderCallable({
          shippingAddress: shippingAddressPayload,
          idempotencyKey: idempotencyKeyRef.current,
          paymentMethod: 'cod',
        });
        order = response.data;
      }
      const confirmedTotal = order.total / 100;

      setPayInfo({
        method: 'cod',
        methodLabel: 'Cash on Delivery',
        codFee: order.codFee / 100,
        totalWithCod: confirmedTotal,
        confirmationStatus: 'confirmed',
      });

      clearCart();

      navigate('/order-confirmation', {
        state: {
          orderId: order.orderId,
          total: confirmedTotal,
          subtotal: order.subtotal / 100,
          shippingFee: order.shippingFee / 100,
          codFee: order.codFee / 100,
          paymentMethod: order.paymentMethod,
          orderStatus: order.orderStatus,
          paymentStatus: order.paymentStatus,
          itemCount: order.itemCount,
          shippingName: name,
          shippingAddress: `${form.address.trim()}, ${form.city.trim()}, ${form.state.trim()} - ${form.zip.trim()}`,
        },
      });
    } catch (error) {
      console.error('Order creation failed:', error);

      const firebaseError = error as { code?: string; message?: string };

      if (firebaseError.code === 'functions/unauthenticated') {
        setOrderError('Your session has expired. Sign in and try again.');
      } else if (firebaseError.code === 'functions/failed-precondition') {
        setOrderError(
          firebaseError.message || 'This order cannot be placed. Check product stock availability and payment method.'
        );
      } else if (firebaseError.code === 'functions/not-found') {
        setOrderError(
          firebaseError.message || 'One or more products in your cart could not be found in the catalog.'
        );
      } else if (firebaseError.code === 'functions/invalid-argument') {
        setOrderError(
          firebaseError.message || 'Please check your shipping address details and try again.'
        );
      } else if (firebaseError.code === 'functions/already-exists') {
        setOrderError(
          'Order session details updated. Please retry placing your order.'
        );
      } else {
        setOrderError(
          'We could not confirm your order. Check your connection and retry. Retrying is safe and will not create duplicate orders.'
        );
      }
    } finally {
      setPlacing(false);
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-50 pt-28 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-xs text-slate-500 font-medium">Verifying checkout session…</p>
      </main>
    );
  }

  if (items.length === 0 && step < 3) {
    return (
      <main className="min-h-screen bg-slate-50 pt-28 flex flex-col items-center justify-center px-4 text-center">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
            <Package size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Your cart is empty</h2>
          <p className="text-xs text-slate-500">Add products to your shopping bag before proceeding to checkout.</p>
          <Link to="/products" className="btn-primary py-2.5 px-6 rounded-xl text-xs inline-flex">
            Browse Catalog
          </Link>
        </div>
      </main>
    );
  }

  const inputClass = "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all text-xs sm:text-sm";
  const labelClass = "block text-slate-700 text-xs font-semibold uppercase tracking-wider mb-1.5";

  /* ─── Payment method tab button ─── */
  const PMTab = ({
    id, icon: Icon, label, sub, disabled
  }: {
    id: PaymentMethodId; icon: React.ElementType; label: string; sub?: string; disabled?: boolean
  }) => (
    <button
      type="button"
      id={`pm-tab-${id}`}
      disabled={disabled}
      onClick={() => setPayMethod(id)}
      className={clsx(
        'flex items-center gap-3 w-full px-4 py-3 rounded-xl border text-left transition-all',
        disabled
          ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-200'
          : payMethod === id
            ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-400'
            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      )}
    >
      <span className={clsx(
        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
        payMethod === id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
      )}>
        <Icon size={18} />
      </span>
      <span className="flex-1 min-w-0">
        <span className={clsx('block text-sm font-semibold', payMethod === id ? 'text-blue-900' : 'text-slate-800')}>
          {label}
          {id === 'upi' && <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">Recommended</span>}
        </span>
        {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
        {disabled && <span className="text-[10px] text-amber-600 font-medium">Not available for prepaid-only items</span>}
      </span>
      <span className={clsx(
        'w-4 h-4 rounded-full border-2 shrink-0',
        payMethod === id ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
      )}>
        {payMethod === id && <span className="block w-1.5 h-1.5 bg-white rounded-full m-auto mt-0.5" />}
      </span>
    </button>
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 overflow-x-clip">
      <div className="page-container py-6 sm:py-8">

        {/* Back navigation */}
        <button
          onClick={() => step > 0 ? setStep(s => s - 1) : navigate('/products')}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 text-xs font-semibold mb-6 transition-colors"
        >
          <ArrowLeft size={14} /> {step > 0 ? 'Back to previous step' : 'Continue Shopping'}
        </button>

        <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900 mb-6 tracking-tight">
          Secure Checkout
        </h1>

        {/* Step Progress Pills */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center shrink-0">
              <div className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border',
                i === step ? 'bg-blue-600 text-white border-blue-600 shadow-2xs' :
                  i < step ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    'bg-white text-slate-400 border-slate-200'
              )}>
                {i < step ? (
                  <CheckCircle2 size={13} className="text-emerald-600" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px]">
                    {i + 1}
                  </span>
                )}
                <span>{s}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight size={14} className="mx-1 text-slate-300 shrink-0" />}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Checkout Form Column */}
          <div className="lg:col-span-8 space-y-6">

            {/* ──────────── Step 0: Cart Review ──────────── */}
            {step === 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="font-display font-bold text-base text-slate-900">Review Items in Bag</h2>
                  <span className="text-xs text-slate-500 font-medium">{items.length} unique item{items.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map(item => (
                    <div key={item.product.id} className="flex items-center gap-4 py-3">
                      <img
                        src={item.product.images[0]}
                        alt={item.product.name}
                        className="w-16 h-16 rounded-xl object-cover bg-slate-100 border border-slate-100 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{item.product.name}</p>
                        {item.selectedSize && <p className="text-[11px] text-slate-400">Size: {item.selectedSize}</p>}
                        <p className="text-[11px] text-slate-500 mt-0.5">Quantity: {item.quantity}</p>
                        {item.product.prepaidOnly && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full mt-1">
                            <Lock size={9} /> Prepaid only
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-slate-900">
                        ₹{(item.product.price * item.quantity).toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ──────────── Step 1: Shipping Address ──────────── */}
            {step === 1 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="font-display font-bold text-base text-slate-900">Shipping Address</h2>
                  <p className="text-xs text-slate-500">Provide the recipient delivery location for tracked shipment.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>First Name</label>
                    <input id="ship-first" type="text" placeholder="Rahul" value={form.firstName} onChange={set('firstName')} required className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Last Name</label>
                    <input id="ship-last" type="text" placeholder="Sharma" value={form.lastName} onChange={set('lastName')} required className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Email for Order Updates</label>
                    <input id="ship-email" type="email" placeholder="rahul@example.com" value={form.email} onChange={set('email')} required className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Mobile Number</label>
                    <input id="ship-phone" type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={set('phone')} required className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Street Address</label>
                    <input id="ship-address" type="text" placeholder="House No, Street, Area" value={form.address} onChange={set('address')} required className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>City</label>
                    <input id="ship-city" type="text" placeholder="Mumbai" value={form.city} onChange={set('city')} required className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>State</label>
                    <select id="ship-state" value={form.state} onChange={set('state')} className={inputClass}>
                      <option value="">Select State</option>
                      {['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
                        'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
                        'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
                        'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
                        'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>PIN Code</label>
                    <input id="ship-zip" type="text" maxLength={6} placeholder="400001" value={form.zip} onChange={set('zip')} required className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Country</label>
                    <select id="ship-country" value={form.country} onChange={set('country')} className={inputClass}>
                      <option value="IN">India</option>
                      <option value="US">United States</option>
                      <option value="GB">United Kingdom</option>
                      <option value="CA">Canada</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ──────────── Step 2: Payment ──────────── */}
            {step === 2 && (
              <div className="space-y-4">
                {/* Header */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="font-display font-bold text-base text-slate-900">Payment Method</h2>
                    <span className="badge-clean bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs flex items-center gap-1">
                      <Lock size={10} /> Secure Checkout
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">Select your preferred payment method.</p>
                </div>

                {/* Secure Payment notice */}
                <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-start gap-2.5">
                  <ShieldCheck size={16} className="text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold block text-blue-950">Cash on Delivery Available</strong>
                    <span className="text-[11px] text-blue-800 leading-relaxed block mt-0.5">
                      Select Cash on Delivery to pay upon arrival. Digital payment gateways (UPI, Cards) will be activated for automated settlements.
                    </span>
                  </div>
                </div>

                {/* Payment method selector */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Choose a payment method</p>

                  <PMTab id="upi" icon={QrCode} label="UPI" sub="GPay, PhonePe, Paytm, BHIM & more" />
                  <PMTab id="card" icon={CreditCard} label="Credit / Debit Card" sub="Visa, Mastercard, Rupay" />
                  <PMTab id="netbanking" icon={Building2} label="Net Banking" sub="All major Indian banks" />
                  <PMTab id="cod" icon={Truck} label="Cash on Delivery" sub={`₹${codFee} handling fee · Pay when delivered`} disabled={hasPrepaidOnly} />
                </div>

                {/* ── UPI Panel ── */}
                {payMethod === 'upi' && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                    {/* Sub-tabs */}
                    <div className="flex gap-2 bg-slate-100 rounded-xl p-1">
                      {(['qr', 'id', 'apps'] as const).map(tab => (
                        <button
                          key={tab}
                          id={`upi-tab-${tab}`}
                          onClick={() => setUpiTab(tab)}
                          className={clsx(
                            'flex-1 py-2 rounded-lg text-xs font-semibold transition-all',
                            upiTab === tab
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-500 hover:text-slate-700'
                          )}
                        >
                          {tab === 'qr' ? 'Scan QR' : tab === 'id' ? 'UPI ID' : 'Open App'}
                        </button>
                      ))}
                    </div>

                    {/* QR tab */}
                    {upiTab === 'qr' && (
                      <div className="flex flex-col items-center gap-4 py-2">
                        <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-xs inline-block">
                          <MockQRCode size={160} />
                        </div>
                        <div className="text-center space-y-1">
                          <p className="text-base font-bold text-slate-900">₹{total.toFixed(0)}</p>
                          <p className="text-xs text-slate-500">Pay to <strong className="text-slate-800">NovaShop</strong></p>
                          <p className="text-[11px] text-slate-400">UPI ID: novashop@upi</p>
                        </div>
                        {/* Countdown */}
                        <div className={clsx(
                          'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold',
                          upiCountdown.expired
                            ? 'bg-red-50 border border-red-200 text-red-700'
                            : 'bg-amber-50 border border-amber-200 text-amber-800'
                        )}>
                          <Clock size={13} />
                          {upiCountdown.expired ? (
                            <>QR expired · <button onClick={upiCountdown.reset} className="underline flex items-center gap-1"><RefreshCw size={11} />Refresh</button></>
                          ) : (
                            <>Expires in {upiCountdown.display}</>
                          )}
                        </div>
                        {/* Waiting indicator */}
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Wifi size={13} className="animate-pulse text-blue-500" />
                          Waiting for payment confirmation…
                        </div>
                        {/* UPI app suggestions */}
                        <div className="w-full border-t border-slate-100 pt-4">
                          <p className="text-[11px] text-slate-400 text-center mb-3">or open directly in</p>
                          <div className="grid grid-cols-4 gap-2">
                            {UPI_APPS.map(app => (
                              <button
                                key={app.id}
                                id={`upi-qr-app-${app.id}`}
                                type="button"
                                className="flex flex-col items-center gap-1.5 p-2 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all"
                              >
                                <span
                                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold"
                                  style={{ background: app.color }}
                                >
                                  {app.letter}
                                </span>
                                <span className="text-[10px] text-slate-600 font-medium">{app.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* Mobile CTA */}
                        <div className="w-full sm:hidden">
                          <button
                            id="upi-open-app-cta"
                            type="button"
                            className="btn-primary w-full py-3 text-sm rounded-xl"
                          >
                            <Smartphone size={16} /> Open UPI App to Pay
                          </button>
                          <p className="text-[10px] text-slate-400 text-center mt-2">Opens your preferred UPI app (demo)</p>
                        </div>
                      </div>
                    )}

                    {/* UPI ID tab */}
                    {upiTab === 'id' && (
                      <div className="space-y-4">
                        <div>
                          <label className={labelClass}>Your UPI ID</label>
                          <input
                            id="upi-id-input"
                            type="text"
                            placeholder="yourname@okaxis / yourname@ybl"
                            value={upiId}
                            onChange={e => setUpiId(e.target.value)}
                            className={inputClass}
                            autoComplete="off"
                          />
                          <p className="text-[11px] text-slate-400 mt-1">Enter any format — this is a demo, no real payment will be initiated.</p>
                        </div>
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                          <span className="text-slate-500">Amount to pay:</span>
                          <span className="font-bold text-slate-900">₹{total.toFixed(0)}</span>
                        </div>
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-center gap-2">
                          <Wifi size={13} className="animate-pulse shrink-0" />
                          Clicking "Verify & Pay" will simulate a successful UPI payment.
                        </div>
                      </div>
                    )}

                    {/* Open App tab */}
                    {upiTab === 'apps' && (
                      <div className="space-y-4">
                        <p className="text-xs text-slate-600">Choose your preferred UPI app:</p>
                        <div className="grid grid-cols-2 gap-3">
                          {UPI_APPS.map(app => (
                            <button
                              key={app.id}
                              id={`upi-app-select-${app.id}`}
                              type="button"
                              onClick={() => setSelectedApp(app.label)}
                              className={clsx(
                                'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
                                selectedApp === app.label
                                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-400'
                                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                              )}
                            >
                              <span
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                                style={{ background: app.color }}
                              >
                                {app.letter}
                              </span>
                              <span className="text-sm font-semibold text-slate-800">{app.label}</span>
                            </button>
                          ))}
                        </div>
                        {selectedApp && (
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between">
                            <span className="text-slate-500">Pay ₹{total.toFixed(0)} via {selectedApp}</span>
                            <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Demo</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Card Panel ── */}
                {payMethod === 'card' && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-slate-700">Enter card details</p>
                      {/* Brand indicators */}
                      <div className="flex items-center gap-1.5">
                        {[
                          { label: 'Visa', color: '#1a1f71', text: 'white' },
                          { label: 'MC', color: '#eb001b', text: 'white' },
                          { label: 'RuPay', color: '#168039', text: 'white' },
                        ].map(b => (
                          <span
                            key={b.label}
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: b.color, color: b.text }}
                          >
                            {b.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Cardholder Name</label>
                      <input id="card-name" type="text" placeholder="Rahul Sharma" value={cardName} onChange={e => setCardName(e.target.value)} className={inputClass} autoComplete="off" />
                    </div>
                    <div>
                      <label className={labelClass}>Card Number</label>
                      <div className="relative">
                        <CreditCard size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          id="card-number"
                          type="text"
                          maxLength={19}
                          placeholder="4242 •••• •••• 4242"
                          value={cardNum}
                          onChange={e => setCardNum(e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim())}
                          className={inputClass + " pl-10"}
                          autoComplete="off"
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Expiry Date</label>
                        <input
                          id="card-expiry"
                          type="text"
                          maxLength={5}
                          placeholder="MM/YY"
                          value={expiry}
                          onChange={e => {
                            const v = e.target.value.replace(/\D/g, '');
                            setExpiry(v.length >= 3 ? v.slice(0, 2) + '/' + v.slice(2) : v);
                          }}
                          className={inputClass}
                          autoComplete="off"
                          inputMode="numeric"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>CVV / CVC</label>
                        <input
                          id="card-cvv"
                          type="password"
                          maxLength={4}
                          placeholder="•••"
                          value={cvv}
                          onChange={e => setCvv(e.target.value.replace(/\D/g, ''))}
                          className={inputClass}
                          autoComplete="off"
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                      <ShieldCheck size={11} className="text-emerald-500" />
                      Card data is not saved, logged, or sent to any server. Demo mode only.
                    </p>
                  </div>
                )}

                {/* ── Net Banking Panel ── */}
                {payMethod === 'netbanking' && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                    <p className="text-xs font-semibold text-slate-700">Select your bank</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {BANKS.map(bank => (
                        <button
                          key={bank}
                          id={`bank-${bank.replace(/\s+/g, '-').toLowerCase()}`}
                          type="button"
                          onClick={() => setSelectedBank(bank)}
                          className={clsx(
                            'flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all',
                            selectedBank === bank
                              ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-400'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          )}
                        >
                          <span className={clsx(
                            'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
                            selectedBank === bank ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                          )}>
                            {bank.split(' ').map(w => w[0]).slice(0, 2).join('')}
                          </span>
                          <span className="text-xs font-medium text-slate-800 truncate">{bank}</span>
                          {selectedBank === bank && <CheckCircle2 size={14} className="text-blue-600 shrink-0 ml-auto" />}
                        </button>
                      ))}
                    </div>
                    {selectedBank && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between">
                        <span className="text-slate-500">Pay ₹{total.toFixed(0)} via {selectedBank}</span>
                        <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Demo</span>
                      </div>
                    )}
                  </div>
                )}

                {/* ── COD Panel ── */}
                {payMethod === 'cod' && !hasPrepaidOnly && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <Truck size={20} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-900">Cash on Delivery</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          Keep ₹{total.toFixed(0)} ready at the time of delivery. A ₹{codFee} handling fee applies.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Order total</span>
                        <span className="font-semibold">₹{(totalPrice + shipping).toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>COD handling fee</span>
                        <span className="font-semibold">₹{codFee}</span>
                      </div>
                      <div className="flex justify-between text-slate-900 font-bold border-t border-slate-100 pt-2">
                        <span>Total payable at door</span>
                        <span className="text-blue-600">₹{total.toFixed(0)}</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <ShieldCheck size={11} className="text-emerald-500" />
                      COD is not available for prepaid-only products.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ──────────── Step 3: Confirmation Summary ──────────── */}
            {step === 3 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xs text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mx-auto">
                  <CheckCircle2 size={28} />
                </div>
                <h2 className="font-display font-bold text-xl text-slate-900">Ready to Confirm</h2>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Review your delivery and payment details before finalizing the transaction.
                </p>

                <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 text-left text-xs space-y-2 max-w-md mx-auto">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Shipping to:</span>
                    <strong className="text-slate-900">{form.firstName || 'Customer'} {form.lastName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Address:</span>
                    <strong className="text-slate-900 truncate max-w-[200px]">{form.address || 'Address on file'}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment method:</span>
                    <strong className="text-slate-900">{payInfo?.methodLabel || 'UPI'}</strong>
                  </div>
                  <div className="flex justify-between font-bold pt-2 border-t border-slate-200">
                    <span className="text-slate-700">Total</span>
                    <span className="text-blue-600">₹{total.toFixed(0)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-end gap-3 pt-2">
              {step < 3 ? (
                <button
                  id={`checkout-next-step-${step}`}
                  onClick={() => {
                    if (step === 2) capturePayInfo();
                    setStep(s => s + 1);
                  }}
                  className="btn-primary py-3 px-6 text-xs sm:text-sm rounded-xl"
                >
                  <span>
                    {step === 0 ? 'Proceed to Shipping' :
                      step === 1 ? 'Continue to Payment' :
                        'Review Summary'}
                  </span>
                  <ChevronRight size={15} />
                </button>
              ) : (
                <button
                  id="place-order-btn"
                  onClick={placeOrder}
                  disabled={placing}
                  className="btn-primary py-3.5 px-8 text-sm rounded-xl"
                >
                  {placing ? (
                    <span>Processing Order…</span>
                  ) : (
                    <>
                      <span>Place &amp; Confirm Order</span>
                      <Lock size={14} />
                    </>
                  )}
                </button>
              )}
            </div>

          </div>

          {/* Right Column: Order Summary */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs lg:sticky lg:top-20 space-y-4">
              <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100">
                Order Summary
              </h3>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {items.map(item => (
                  <div key={item.product.id} className="flex justify-between text-xs">
                    <span className="text-slate-600 truncate max-w-[150px]">
                      {item.product.name} ×{item.quantity}
                    </span>
                    <span className="text-slate-900 font-semibold shrink-0">
                      ₹{(item.product.price * item.quantity).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Items Subtotal</span>
                  <span className="font-semibold text-slate-900">₹{totalPrice.toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Delivery Charges</span>
                  <span className={shipping === 0 ? 'text-emerald-700 font-semibold' : 'text-slate-900 font-semibold'}>
                    {shipping === 0 ? 'FREE' : `₹${shipping}`}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>GST (18%)</span>
                  <span className="font-semibold text-slate-900">Included</span>
                </div>
                {payMethod === 'cod' && !hasPrepaidOnly && (
                  <div className="flex justify-between text-amber-700">
                    <span>COD Fee</span>
                    <span className="font-semibold">₹{codFee}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Total Amount</span>
                  <span className="text-blue-600">₹{total.toFixed(0)}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-2 text-[11px] text-slate-500">
                <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                <span>30-Day Returns &amp; 100% Secure Checkout</span>
              </div>
            </div>

            {!isAuthenticated && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-center text-xs">
                <p className="text-slate-500 mb-1">Have a registered account?</p>
                <Link to="/login" id="checkout-login-link" className="font-bold text-blue-600 hover:text-blue-700">
                  Sign in for faster address auto-fill
                </Link>
              </div>
            )}
          </div>

        </div>

      </div>
    </main>
  );
}
