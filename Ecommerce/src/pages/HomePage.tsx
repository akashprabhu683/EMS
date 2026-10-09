import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ShieldCheck,
  Truck,
  RotateCcw,
  Star,
  Sparkles,
  Lock,
} from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { PRODUCTS, getCategoryCount } from '../data/products';
import { useState } from 'react';

export function HomePage() {
  const [activeTab, setActiveTab] = useState<'featured' | 'new' | 'electronics' | 'fashion'>('featured');

  const getDisplayedProducts = () => {
    switch (activeTab) {
      case 'new':         return PRODUCTS.filter(p => p.isNew);
      case 'electronics': return PRODUCTS.filter(p => p.category === 'electronics');
      case 'fashion':     return PRODUCTS.filter(p => p.category === 'fashion');
      default:            return PRODUCTS.filter(p => p.featured);
    }
  };

  const displayedProducts = getDisplayedProducts().slice(0, 4);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-4 sm:pb-6">
      <div className="page-container pt-6 sm:pt-8 pb-2">

        {/* ── 1. HERO BENTO GRID ────────────────────────────────── */}
        <section aria-label="Hero Spotlight">
          <div className="hero-bento-grid">

            {/* Main Hero Card — 7fr on desktop */}
            <div className="bento-card hero-main-card bg-gradient-to-br from-blue-50/90 via-slate-50 to-indigo-50/60 border border-slate-200">
              {/* Top: badge + headline + description + trust bullets */}
              <div className="space-y-4 sm:space-y-5 max-w-xl text-child">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-100/90 text-blue-700 text-xs font-semibold tracking-wide shadow-2xs">
                  <Sparkles size={14} className="text-blue-600 shrink-0" />
                  <span>2026 Collection Available</span>
                </div>

                <h1 className="font-display font-extrabold text-[clamp(1.75rem,3.8vw,3rem)] text-slate-900 tracking-tight leading-[1.12]">
                  Everyday Essentials.<br />
                  <span className="text-blue-600">Refined Quality.</span>
                </h1>

                <p className="text-slate-600 text-sm sm:text-base leading-relaxed max-w-lg">
                  Curated audio, minimalist apparel, and workspace gear built with premium materials for effortless daily use.
                </p>

              </div>

              {/* Bottom: CTAs + review badge with proper breathing space */}
              <div className="pt-8 sm:pt-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    to="/products"
                    id="hero-primary-cta"
                    className="btn-primary py-3 px-6 text-sm rounded-xl shadow-xs"
                  >
                    <span>Shop All Products</span>
                    <ArrowRight size={16} />
                  </Link>
                  <Link
                    to="/products?category=electronics"
                    id="hero-secondary-cta"
                    className="btn-secondary py-3 px-5 text-sm rounded-xl"
                  >
                    <span>Browse Tech</span>
                  </Link>
                </div>

                <div className="flex items-center gap-2 bg-white/95 border border-slate-200/90 px-4 py-2.5 rounded-xl shadow-2xs shrink-0">
                  <div className="flex text-amber-400">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star key={i} size={13} fill="#f59e0b" stroke="#f59e0b" />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-slate-900">4.9 / 5.0</span>
                  <span className="text-[11px] text-slate-400">· 14k+ Reviews</span>
                </div>
              </div>
            </div>

            {/* Right column — 5fr: 2 stacked promo cards */}
            <div className="hero-right-col">

              {/* Flash Deal card — naturally sized, unclipped */}
              <div className="bento-card bento-promo-warm p-6 sm:p-7 flex flex-col justify-between">
                <div className="text-child">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-3">
                    <span className="badge-clean bg-orange-100 text-orange-800 font-bold text-xs">
                      ⚡ FLASH DEAL
                    </span>
                    <span className="text-xs font-bold text-orange-700 bg-white/90 px-2.5 py-1 rounded-md border border-orange-200 shadow-2xs shrink-0">
                      Save $200
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-lg sm:text-xl text-slate-900 leading-snug mb-1.5">
                    AirPods Pro Max Ultra
                  </h3>
                  <p className="text-slate-600 text-xs sm:text-sm leading-relaxed mb-4">
                    Active noise cancellation with 30-hour spatial audio experience and memory foam cushions.
                  </p>
                  <div className="flex items-baseline gap-2.5 mb-2">
                    <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">$349</span>
                    <span className="text-sm text-slate-400 line-through">$549</span>
                  </div>
                </div>

                <Link
                  to="/product/p1"
                  className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 active:bg-black text-white font-semibold text-xs sm:text-sm py-3 px-5 rounded-xl transition-all shadow-2xs mt-4 mb-8"
                >
                  <span>Claim Offer</span>
                  <ArrowRight size={14} />
                </Link>
              </div>

              {/* Seasonal Drop card — rebalanced, padded */}
              <div className="bento-card bg-white p-6 sm:p-7 flex flex-col justify-between border border-slate-200">
                <div className="text-child">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-3">
                    <span className="badge-clean bg-slate-100 text-slate-700 text-xs font-semibold">
                      New In Stock
                    </span>
                    <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100 shrink-0">
                      Autumn Drop
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-lg sm:text-xl text-slate-900 mb-1.5">
                    Modern Outerwear
                  </h3>
                  <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                    Weather-resistant minimalist jackets crafted from recycled technical fabrics for all seasons.
                  </p>
                </div>

                <Link
                  to="/products?category=fashion"
                  className="inline-flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-800 hover:text-blue-600 group pt-4 mt-4 border-t border-slate-100 transition-colors"
                >
                  <span>Explore Collection</span>
                  <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform shrink-0" />
                </Link>
              </div>

            </div>
          </div>
        </section>

        {/* ── TRUST BADGE STRIP ───────────────────────────────────────
             Replaces the old announcement bar — four pill badges
             centred below the hero, visible on all breakpoints          */}
        <div className="mt-5 sm:mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {[
            { icon: Truck,        text: 'Free delivery over $50',    color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200' },
            { icon: RotateCcw,   text: '30-day hassle-free returns', color: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-200'    },
            { icon: ShieldCheck, text: 'Verified authenticity',      color: 'text-violet-700',  bg: 'bg-violet-50',   border: 'border-violet-200'  },
            { icon: Lock,        text: 'Secure checkout',            color: 'text-slate-700',   bg: 'bg-slate-100',   border: 'border-slate-200'   },
          ].map(({ icon: Icon, text, color, bg, border }) => (
            <span
              key={text}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold ${bg} ${color} border ${border} shadow-2xs whitespace-nowrap`}
            >
              <Icon size={12} className="shrink-0" />
              {text}
            </span>
          ))}
        </div>

        {/* ── 2. STORE BENEFITS GRID ──────────────────────────────── */}
        <section aria-label="Store Benefits" className="mt-12 sm:mt-16">
          <div className="benefit-grid">
            {[
              { icon: Truck,       title: 'Free Global Delivery',   desc: 'On orders over $50. Real-time courier tracking from hub to door.',        badge: 'Fast & Reliable' },
              { icon: ShieldCheck, title: 'Authenticity Guarantee', desc: '100% verified genuine items sourced direct from authorized makers.',       badge: 'Verified Genuine' },
              { icon: RotateCcw,   title: '30-Day Easy Returns',    desc: 'Prepaid return label included in every box with no questions asked.',      badge: 'Risk-Free' },
              { icon: Lock,        title: 'Encrypted Checkout',     desc: '256-bit bank-grade SSL with instant Apple Pay and major card support.',   badge: 'PCI Compliant' },
            ].map((benefit, i) => {
              const Icon = benefit.icon;
              return (
                <div key={i} className="bento-card p-6 bg-white border border-slate-200/90 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs">
                        <Icon size={20} />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md shrink-0">
                        {benefit.badge}
                      </span>
                    </div>
                    <h3 className="font-display font-bold text-sm sm:text-base text-slate-900 mb-1.5">
                      {benefit.title}
                    </h3>
                    <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
                      {benefit.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 3. FEATURED CATEGORIES BENTO GRID ──────────────────── */}
        <section aria-label="Featured Categories" className="mt-14 sm:mt-20">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
            <div className="text-child">
              <span className="text-xs font-bold text-blue-600 tracking-wider uppercase">Collections</span>
              <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight mt-0.5">
                Featured Categories
              </h2>
            </div>
            <Link
              to="/products"
              className="text-xs sm:text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 group shrink-0 sm:self-end pb-0.5"
            >
              <span>View All Categories</span>
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          <div className="category-bento-grid">

            {/* Electronics — 7 cols, large card */}
            <Link
              to="/products?category=electronics"
              className="lg:col-span-7 bento-card cat-card-large p-7 sm:p-8 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white flex flex-col justify-between group shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between text-child">
                <div className="min-w-0 pr-4">
                  <span className="inline-block px-3 py-1 rounded-md bg-blue-500/20 text-blue-300 text-xs font-bold mb-3 border border-blue-400/30">
                    Popular
                  </span>
                  <h3 className="font-display font-bold text-xl sm:text-2xl text-white group-hover:text-blue-300 transition-colors">
                    Electronics &amp; Sound
                  </h3>
                  <p className="text-slate-300 text-xs sm:text-sm max-w-sm mt-2 leading-relaxed">
                    Smart noise-canceling headphones, 4K displays, titanium watches, and precision audio gear.
                  </p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-3xl border border-white/10 group-hover:scale-105 transition-transform shrink-0">
                  ⚡
                </div>
              </div>
              <div className="flex items-center justify-between pt-6 border-t border-white/10 mt-6">
                <span className="text-xs sm:text-sm font-medium text-slate-300">
                  {getCategoryCount('electronics')} Products
                </span>
                <span className="text-xs sm:text-sm font-semibold text-blue-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  Shop Electronics <ArrowRight size={14} />
                </span>
              </div>
            </Link>

            {/* Fashion — 5 cols, large card */}
            <Link
              to="/products?category=fashion"
              className="lg:col-span-5 bento-card cat-card-large p-7 sm:p-8 bg-gradient-to-br from-rose-50 via-slate-50 to-amber-50/50 border border-slate-200 flex flex-col justify-between group shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between text-child">
                <div className="min-w-0 pr-4">
                  <span className="inline-block px-3 py-1 rounded-md bg-rose-100 text-rose-800 text-xs font-bold mb-3 border border-rose-200">
                    Trending
                  </span>
                  <h3 className="font-display font-bold text-xl sm:text-2xl text-slate-900 group-hover:text-rose-600 transition-colors">
                    Fashion &amp; Apparel
                  </h3>
                  <p className="text-slate-600 text-xs sm:text-sm mt-2 leading-relaxed max-w-xs">
                    Clean tailoring, genuine leather jackets, and breathable capsule staples.
                  </p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-rose-100/70 border border-rose-200 text-3xl flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                  👗
                </div>
              </div>
              <div className="flex items-center justify-between pt-6 border-t border-slate-200/80 mt-6">
                <span className="text-xs sm:text-sm font-medium text-slate-600">
                  {getCategoryCount('fashion')} Products
                </span>
                <span className="text-xs sm:text-sm font-semibold text-rose-700 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  Shop Fashion <ArrowRight size={14} />
                </span>
              </div>
            </Link>

            {/* Home & Living — 4 cols, small card */}
            <Link
              to="/products?category=home"
              className="lg:col-span-4 bento-card cat-card-small p-6 bg-white border border-slate-200 flex flex-col justify-between group shadow-2xs hover:shadow-sm transition-all"
            >
              <div className="text-child">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-xl flex items-center justify-center mb-3">
                  🏠
                </div>
                <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 group-hover:text-blue-600 transition-colors">
                  Home &amp; Living
                </h3>
                <p className="text-slate-500 text-xs sm:text-sm mt-1 leading-relaxed">
                  Minimalist interior accents and ceramic artisan accessories.
                </p>
              </div>
              <div className="flex items-center justify-between text-xs sm:text-sm pt-4 border-t border-slate-100 mt-4">
                <span className="text-slate-500">{getCategoryCount('home')} Items</span>
                <span className="font-semibold text-slate-900 group-hover:text-blue-600 flex items-center gap-1">
                  Explore <ArrowRight size={13} />
                </span>
              </div>
            </Link>

            {/* Beauty & Skincare — 4 cols, small card */}
            <Link
              to="/products?category=beauty"
              className="lg:col-span-4 bento-card cat-card-small p-6 bg-white border border-slate-200 flex flex-col justify-between group shadow-2xs hover:shadow-sm transition-all"
            >
              <div className="text-child">
                <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 text-xl flex items-center justify-center mb-3">
                  ✨
                </div>
                <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 group-hover:text-blue-600 transition-colors">
                  Beauty &amp; Skincare
                </h3>
                <p className="text-slate-500 text-xs sm:text-sm mt-1 leading-relaxed">
                  Clinical-grade serums and nourishing daily routines.
                </p>
              </div>
              <div className="flex items-center justify-between text-xs sm:text-sm pt-4 border-t border-slate-100 mt-4">
                <span className="text-slate-500">{getCategoryCount('beauty')} Items</span>
                <span className="font-semibold text-slate-900 group-hover:text-blue-600 flex items-center gap-1">
                  Explore <ArrowRight size={13} />
                </span>
              </div>
            </Link>

            {/* Sports & Fitness — 4 cols, small card */}
            <Link
              to="/products?category=sports"
              className="lg:col-span-4 bento-card cat-card-small p-6 bg-white border border-slate-200 flex flex-col justify-between group shadow-2xs hover:shadow-sm transition-all"
            >
              <div className="text-child">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 text-xl flex items-center justify-center mb-3">
                  🏃
                </div>
                <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 group-hover:text-blue-600 transition-colors">
                  Sports &amp; Fitness
                </h3>
                <p className="text-slate-500 text-xs sm:text-sm mt-1 leading-relaxed">
                  High-performance running shoes and workout essentials.
                </p>
              </div>
              <div className="flex items-center justify-between text-xs sm:text-sm pt-4 border-t border-slate-100 mt-4">
                <span className="text-slate-500">{getCategoryCount('sports')} Items</span>
                <span className="font-semibold text-slate-900 group-hover:text-blue-600 flex items-center gap-1">
                  Explore <ArrowRight size={13} />
                </span>
              </div>
            </Link>

          </div>
        </section>

        {/* ── 4. BEST-SELLING PRODUCTS ────────────────────────────── */}
        <section aria-label="Best-Selling Products" className="mt-14 sm:mt-20">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-8">
            <div className="text-child">
              <span className="text-xs font-bold text-blue-600 tracking-wider uppercase">Hand-Picked</span>
              <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight mt-0.5">
                Best-Selling Products
              </h2>
            </div>

            {/* Filter Tabs with proper pill padding and active indicator */}
            <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200/80 p-1.5 rounded-2xl shrink-0 overflow-x-auto sm:self-end">
              {[
                { id: 'featured',    label: 'Top Picks' },
                { id: 'new',         label: 'New Drops' },
                { id: 'electronics', label: 'Tech' },
                { id: 'fashion',     label: 'Apparel' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Product grid — equal-height rows */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6 items-stretch">
            {displayedProducts.map((product, i) => (
              <ProductCard key={product.id} product={product} index={i} />
            ))}
          </div>

          {/* Browse all button with generous vertical margin */}
          <div className="my-10 sm:my-12 text-center">
            <Link
              to="/products"
              className="btn-secondary py-3 px-8 rounded-xl text-xs sm:text-sm font-semibold shadow-2xs hover:shadow-xs"
            >
              <span>Browse All {PRODUCTS.length} Catalog Items</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>

        {/* ── 5. PROMOTION CARDS ──────────────────────────────────── */}
        <section aria-label="Special Promotions" className="mt-14 sm:mt-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
            <div className="bento-card bento-promo-warm p-7 sm:p-9 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-2xs">
              <div className="space-y-2.5 text-child min-w-0 pr-2">
                <span className="badge-clean bg-orange-100 text-orange-800 text-xs font-bold">
                  Coupon Code
                </span>
                <h3 className="font-display font-bold text-xl sm:text-2xl text-slate-900">
                  Audio Season Event
                </h3>
                <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                  Apply code <strong className="text-slate-900 font-mono bg-white/90 px-2 py-0.5 rounded border border-orange-200">NOVA20</strong> at checkout for an extra 20% off all studio equipment.
                </p>
                <Link
                  to="/products?category=electronics"
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-orange-700 hover:text-orange-900 transition-colors pt-2 group"
                >
                  <span>Shop Audio Collection</span>
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white/80 border border-orange-200 flex items-center justify-center text-4xl shrink-0 shadow-2xs">
                🎧
              </div>
            </div>

            <div className="bento-card bento-promo-cool p-7 sm:p-9 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-2xs">
              <div className="space-y-2.5 text-child min-w-0 pr-2">
                <span className="badge-clean bg-blue-100 text-blue-800 text-xs font-bold">
                  Bundle &amp; Save
                </span>
                <h3 className="font-display font-bold text-xl sm:text-2xl text-slate-900">
                  Workspace Essentials
                </h3>
                <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                  Combine 2 or more desk accessories to unlock complimentary express courier delivery &amp; desk pad.
                </p>
                <Link
                  to="/products?category=home"
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-blue-700 hover:text-blue-900 transition-colors pt-2 group"
                >
                  <span>Explore Desk Setups</span>
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white/80 border border-blue-200 flex items-center justify-center text-4xl shrink-0 shadow-2xs">
                🖥️
              </div>
            </div>
          </div>
        </section>

        {/* ── 6. CUSTOMER REVIEWS & TRUST ─────────────────────────── */}
        <section aria-label="Customer Reviews and Trust" className="mt-14 sm:mt-20">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6 sm:mb-8">
            <div className="text-child">
              <span className="text-xs font-bold text-blue-600 tracking-wider uppercase">Social Proof</span>
              <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight mt-0.5">
                Loved by 40,000+ Customers
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 shrink-0 sm:self-end pb-0.5">
              Real feedback from verified purchasers worldwide
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 items-stretch">

            {/* Rating Stat Card */}
            <div className="bento-card p-6 sm:p-7 bg-white border border-slate-200 flex flex-col justify-between shadow-2xs">
              <div className="text-child">
                <span className="badge-clean bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                  ★ Certified Store Rating
                </span>
                <div className="flex items-baseline gap-2.5 mb-2.5 mt-4">
                  <span className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight font-display">4.9</span>
                  <span className="text-slate-400 text-sm font-bold">/ 5.0</span>
                </div>
                <div className="flex text-amber-400 mb-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} size={18} fill="#f59e0b" stroke="#f59e0b" />
                  ))}
                </div>
                <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                  Calculated from 14,250+ verified customer orders across North America and Europe.
                </p>
              </div>

              {/* Stats rows with ample room and unclipped percentages */}
              <div className="mt-6 pt-5 border-t border-slate-100 space-y-3 text-xs sm:text-sm">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Authenticity Rate</span>
                  <strong className="text-slate-900 font-bold text-sm">100%</strong>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>On-Time Courier Arrival</span>
                  <strong className="text-slate-900 font-bold text-sm">99.4%</strong>
                </div>
              </div>
            </div>

            {/* Review 1 */}
            <div className="bento-card p-6 sm:p-7 bg-white border border-slate-200 flex flex-col justify-between shadow-2xs">
              <div className="text-child">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex text-amber-400">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star key={i} size={15} fill="#f59e0b" stroke="#f59e0b" />
                    ))}
                  </div>
                  <span className="badge-clean bg-slate-100 text-slate-600 text-[11px] font-medium">Verified Buyer</span>
                </div>
                <p className="text-slate-700 text-xs sm:text-sm leading-relaxed italic">
                  "The headphones arrived in less than 48 hours. Audio separation is pristine, build quality feels solid, and the packaging is Apple-grade clean."
                </p>
              </div>
              <div className="flex items-center gap-3.5 pt-5 mt-5 border-t border-slate-100">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                  MV
                </div>
                <div className="text-child min-w-0">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">Marcus Vance</h4>
                  <p className="text-[11px] text-slate-400 truncate">Purchased AirPods Pro Max Ultra</p>
                </div>
              </div>
            </div>

            {/* Review 2 */}
            <div className="bento-card p-6 sm:p-7 bg-white border border-slate-200 flex flex-col justify-between shadow-2xs">
              <div className="text-child">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex text-amber-400">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star key={i} size={15} fill="#f59e0b" stroke="#f59e0b" />
                    ))}
                  </div>
                  <span className="badge-clean bg-slate-100 text-slate-600 text-[11px] font-medium">Verified Buyer</span>
                </div>
                <p className="text-slate-700 text-xs sm:text-sm leading-relaxed italic">
                  "Sizing on the leather jacket was exact to the chart. The leather is butter-soft and customer service responded in under 3 minutes when I needed adjustments."
                </p>
              </div>
              <div className="flex items-center gap-3.5 pt-5 mt-5 border-t border-slate-100">
                <div className="w-9 h-9 rounded-full bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center shrink-0">
                  ER
                </div>
                <div className="text-child min-w-0">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">Elena Rostova</h4>
                  <p className="text-[11px] text-slate-400 truncate">Purchased Leather Jacket</p>
                </div>
              </div>
            </div>

          </div>
        </section>

      </div>
    </main>
  );
}
