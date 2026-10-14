import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ShieldCheck,
  Leaf,
  Star,
  Sparkles,
  Search,
  MapPin,
  Clock,
  ChevronRight,
  FlaskConical,
} from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { useState, useEffect, useRef } from 'react';
import { getActiveProducts } from '../services/productService';
import type { Product } from '../types';

/* ─── Herbal categories aligned with Firestore seeds ─── */
const HERBAL_CATEGORIES = [
  {
    slug: 'ayurvedic',
    label: 'Ayurvedic Formulations',
    emoji: '🌿',
    color: 'from-emerald-600 to-teal-700',
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-800',
    desc: 'Time-tested classical preparations',
  },
  {
    slug: 'herbal-extracts',
    label: 'Herbal Extracts & Syrups',
    emoji: '🍃',
    color: 'from-green-600 to-emerald-700',
    bg: 'bg-green-50 border-green-200',
    text: 'text-green-800',
    desc: 'Pure plant-based liquid extracts',
  },
  {
    slug: 'vitality',
    label: 'Vitality & Immunity',
    emoji: '⚡',
    color: 'from-amber-500 to-orange-600',
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    desc: 'Natural energy and immune support',
  },
  {
    slug: 'digestive',
    label: 'Digestive & Metabolism',
    emoji: '🫁',
    color: 'from-blue-500 to-indigo-600',
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-800',
    desc: 'Gut health and digestive wellness',
  },
  {
    slug: 'joint-care',
    label: 'Joint Care & Balms',
    emoji: '🌱',
    color: 'from-violet-500 to-purple-700',
    bg: 'bg-violet-50 border-violet-200',
    text: 'text-violet-800',
    desc: 'Topical relief and mobility support',
  },
  {
    slug: 'wellness-teas',
    label: 'Natural Wellness & Teas',
    emoji: '🍵',
    color: 'from-rose-400 to-pink-600',
    bg: 'bg-rose-50 border-rose-200',
    text: 'text-rose-800',
    desc: 'Herbal infusions for daily calm',
  },
];

const TRUST_BADGES = [
  { icon: Leaf, text: 'Natural Ingredients', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { icon: ShieldCheck, text: 'Quality Assured', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  { icon: FlaskConical, text: 'Lab Tested', color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
  { icon: MapPin, text: 'Collect from Shop', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
];

export function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    getActiveProducts()
      .then(prods => { if (active) setProducts(prods); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const featuredProducts = products.slice(0, 4);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-4">
      <div className="page-container pt-4 sm:pt-6 pb-2">

        {/* ── 1. HERO SECTION ──────────────────────────────────── */}
        <section aria-label="Hero" className="mt-2">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 via-teal-900 to-emerald-950 text-white p-6 sm:p-10 shadow-lg">
            {/* Decorative background blobs */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -top-16 -right-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-teal-400/10 rounded-full blur-2xl" />
            </div>

            <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-400/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold mb-4">
                <Leaf size={13} className="shrink-0" />
                <span>Herbal &amp; Natural Medicine Dispensary</span>
              </div>

              <h1 className="font-display font-extrabold text-[clamp(1.6rem,4vw,2.8rem)] tracking-tight leading-[1.1] mb-3">
                Nature's Healing,{' '}
                <span className="text-emerald-400">Delivered with Care.</span>
              </h1>

              <p className="text-emerald-100/80 text-sm sm:text-base leading-relaxed mb-6 max-w-lg">
                Authentic Ayurvedic formulations, herbal extracts, and natural wellness products.
                Browse our catalog, place an order online, and collect in person at our dispensary.
              </p>

              {/* Search Bar — prominent on hero */}
              <form
                onSubmit={handleSearch}
                className="flex items-center gap-2 w-full max-w-md"
                role="search"
              >
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    ref={searchRef}
                    id="hero-search-input"
                    type="search"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search Ashwagandha, Triphala, Tulsi…"
                    className="w-full h-11 pl-9 pr-4 rounded-xl bg-white text-slate-900 placeholder-slate-400 text-sm outline-none border border-white/10 shadow-sm focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <button
                  type="submit"
                  id="hero-search-btn"
                  className="h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white text-sm font-semibold transition-colors shadow-sm shrink-0 flex items-center gap-1.5"
                >
                  <Search size={15} />
                  <span className="hidden sm:inline">Search</span>
                </button>
              </form>
            </div>

            {/* Click-and-Collect callout */}
            <div className="relative z-10 mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 pt-5 border-t border-white/10">
              <div className="flex items-center gap-2 text-xs text-emerald-200">
                <MapPin size={14} className="text-emerald-400 shrink-0" />
                <span><strong className="text-white">Click &amp; Collect</strong> — Order online, pay &amp; pick up at our dispensary</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald-200">
                <Clock size={14} className="text-emerald-400 shrink-0" />
                <span>Mon–Sat · 9 AM – 7 PM</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── TRUST BADGES ─────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {TRUST_BADGES.map(({ icon: Icon, text, color, bg, border }) => (
            <span
              key={text}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${bg} ${color} border ${border} shadow-2xs whitespace-nowrap`}
            >
              <Icon size={12} className="shrink-0" />
              {text}
            </span>
          ))}
        </div>

        {/* ── 2. CATEGORY GRID ─────────────────────────────────── */}
        <section aria-label="Product Categories" className="mt-10 sm:mt-14">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-5">
            <div>
              <span className="text-xs font-bold text-emerald-600 tracking-wider uppercase">Browse by Category</span>
              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 tracking-tight mt-0.5">
                Our Herbal Collections
              </h2>
            </div>
            <Link
              to="/products"
              className="text-xs sm:text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 group shrink-0"
            >
              <span>View All Products</span>
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {HERBAL_CATEGORIES.map(cat => (
              <Link
                key={cat.slug}
                to={`/products?search=${encodeURIComponent(cat.label)}`}
                className={`flex flex-col items-center text-center p-4 rounded-2xl border ${cat.bg} hover:shadow-md active:scale-95 transition-all cursor-pointer group`}
              >
                <span className="text-3xl mb-2 group-hover:scale-110 transition-transform">{cat.emoji}</span>
                <span className={`text-xs font-bold ${cat.text} leading-tight`}>{cat.label}</span>
                <span className="text-[10px] text-slate-500 mt-0.5 leading-tight hidden sm:block">{cat.desc}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── 3. FEATURED PRODUCTS ─────────────────────────────── */}
        <section aria-label="Featured Products" className="mt-10 sm:mt-14">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-5">
            <div>
              <span className="text-xs font-bold text-emerald-600 tracking-wider uppercase flex items-center gap-1">
                <Sparkles size={11} /> Popular Products
              </span>
              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 tracking-tight mt-0.5">
                Trusted Herbal Remedies
              </h2>
            </div>
            <Link
              to="/products"
              className="text-xs sm:text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 group shrink-0"
            >
              <span>All Products</span>
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="rounded-2xl bg-white border border-slate-200 p-4 animate-pulse">
                  <div className="w-full aspect-square bg-slate-100 rounded-xl mb-3" />
                  <div className="h-3 bg-slate-100 rounded mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-2/3 mb-3" />
                  <div className="h-8 bg-slate-100 rounded-lg" />
                </div>
              ))}
            </div>
          ) : featuredProducts.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {featuredProducts.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <Leaf size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm font-medium">Products loading…</p>
              <p className="text-slate-400 text-xs mt-1">Our herbal catalog is being set up.</p>
            </div>
          )}
        </section>

        {/* ── 4. HOW IT WORKS ──────────────────────────────────── */}
        <section aria-label="How Click and Collect Works" className="mt-12 sm:mt-16">
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-6 sm:p-8">
            <div className="text-center mb-6">
              <span className="text-xs font-bold text-emerald-600 tracking-wider uppercase">How It Works</span>
              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 mt-1">
                Click &amp; Collect in 3 Steps
              </h2>
              <p className="text-slate-500 text-sm mt-1">No online payment needed. Order now, pay at pickup.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              {[
                {
                  step: '1',
                  title: 'Browse & Add to Cart',
                  desc: 'Explore our herbal catalog. No login needed to browse or add items to your cart.',
                  icon: '🛒',
                  color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                },
                {
                  step: '2',
                  title: 'Place Your Order',
                  desc: 'Sign in with Google to confirm. Provide your name and phone for pickup notification.',
                  icon: '📋',
                  color: 'bg-blue-100 text-blue-700 border-blue-200',
                },
                {
                  step: '3',
                  title: 'Collect & Pay at Shop',
                  desc: 'Visit our dispensary when your order is ready. Pay in person with cash or UPI.',
                  icon: '🏪',
                  color: 'bg-amber-100 text-amber-700 border-amber-200',
                },
              ].map(({ step, title, desc, icon, color }) => (
                <div key={step} className="flex flex-col items-center text-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border ${color} shadow-2xs`}>
                    {icon}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Step {step}</div>
                    <h3 className="font-display font-bold text-sm sm:text-base text-slate-900">{title}</h3>
                    <p className="text-slate-500 text-xs sm:text-sm leading-relaxed mt-1">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/products"
                id="hero-primary-cta"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold transition-colors shadow-sm"
              >
                <Leaf size={15} />
                <span>Browse Herbal Catalog</span>
                <ArrowRight size={14} />
              </Link>
              <Link
                to="/orders"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-colors"
              >
                <span>Track My Orders</span>
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        </section>

        {/* ── 5. STORE INFO STRIP ──────────────────────────────── */}
        <section aria-label="Store Information" className="mt-8 sm:mt-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
                <MapPin size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Dispensary Location</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Visit us in person to collect your prepared order and pay on the spot.
                </p>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
                <Clock size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Store Hours</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Monday – Saturday: 9 AM – 7 PM<br />Sunday: Closed
                </p>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Quality Promise</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  All products are sourced from trusted suppliers and verified for quality.
                </p>
              </div>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
