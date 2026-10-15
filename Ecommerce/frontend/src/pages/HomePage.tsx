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
  Percent,
  TrendingUp,
  Award,
  Heart,
} from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { useState, useEffect, useRef } from 'react';
import { getActiveProducts } from '../services/productService';
import type { Product } from '../types';

/* ─── Herbal categories aligned with dispensary catalog ─── */
const HERBAL_CATEGORIES = [
  {
    slug: 'ayurvedic',
    label: 'Ayurvedic Formulations',
    emoji: '🌿',
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-800',
    desc: 'Time-tested classical preparations',
  },
  {
    slug: 'herbal-extracts',
    label: 'Herbal Extracts & Syrups',
    emoji: '🍃',
    bg: 'bg-emerald-50/70 border-emerald-200',
    text: 'text-emerald-800',
    desc: 'Pure plant-based liquid extracts',
  },
  {
    slug: 'vitality',
    label: 'Vitality & Immunity',
    emoji: '⚡',
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    desc: 'Natural energy and immune support',
  },
  {
    slug: 'digestive',
    label: 'Digestive & Metabolism',
    emoji: '🫁',
    bg: 'bg-teal-50 border-teal-200',
    text: 'text-teal-800',
    desc: 'Gut health and digestive wellness',
  },
  {
    slug: 'joint-care',
    label: 'Joint Care & Balms',
    emoji: '🌱',
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-800',
    desc: 'Topical relief and mobility support',
  },
  {
    slug: 'wellness-teas',
    label: 'Natural Wellness & Teas',
    emoji: '🍵',
    bg: 'bg-rose-50 border-rose-200',
    text: 'text-rose-800',
    desc: 'Herbal infusions for daily calm',
  },
];

const TRUST_BADGES = [
  { icon: Leaf, text: 'Pure Botanical Herbs', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { icon: ShieldCheck, text: 'Dispensary Verified', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { icon: FlaskConical, text: 'Lab Standardized', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { icon: MapPin, text: 'Click & Collect Counter', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
];

export function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDealFilter, setActiveDealFilter] = useState<string>('all');
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    getActiveProducts()
      .then(prods => {
        if (active) setProducts(prods);
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  // Curated segments for the Amazon-inspired hero showcase
  const bestSellers = products.filter(p => p.rating >= 4.8).slice(0, 4);
  const dealsUnder499 = products.filter(p => p.price <= 499).slice(0, 4);
  const immunityVitality = products.filter(p => p.category === 'vitality' || p.category === 'herbal-extracts').slice(0, 4);
  const jointAndRelief = products.filter(p => p.category === 'joint-care' || p.category === 'ayurvedic').slice(0, 4);

  // Filtered list based on quick pill selector
  const displayedProducts = products.filter(p => {
    if (activeDealFilter === 'under-299') return p.price <= 299;
    if (activeDealFilter === 'under-499') return p.price <= 499;
    if (activeDealFilter === '4-star') return p.rating >= 4.8;
    if (activeDealFilter === 'ayurvedic') return p.category === 'ayurvedic';
    if (activeDealFilter === 'vitality') return p.category === 'vitality';
    return true;
  });

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-8">
      <div className="page-container pt-3 sm:pt-5 pb-4">

        {/* ── TOP SEARCH & QUICK TAGS ───────────────────────────── */}
        <div className="mb-4 sm:mb-6">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-xs">
            <form onSubmit={handleSearch} className="flex items-center gap-2" role="search">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  ref={searchRef}
                  id="top-hero-search-input"
                  type="search"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search authentic medicines: Ashwagandha, Triphala, Chyawanprash, Brahmi…"
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-slate-50 hover:bg-slate-100/80 focus:bg-white text-slate-900 placeholder-slate-400 text-sm outline-none border border-slate-200 transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <button
                type="submit"
                id="top-hero-search-btn"
                className="h-11 px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white text-sm font-semibold transition-colors shadow-2xs shrink-0 flex items-center gap-2 cursor-pointer"
              >
                <Search size={16} />
                <span className="hidden sm:inline">Search</span>
              </button>
            </form>

            {/* Quick suggestion tags */}
            <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 text-xs text-slate-500">
              <span className="font-semibold text-slate-700 shrink-0">Popular:</span>
              {[
                { label: 'Ashwagandha', q: 'Ashwagandha' },
                { label: 'Triphala Detox', q: 'Triphala' },
                { label: 'Chyawanprash', q: 'Chyawanprash' },
                { label: 'Brahmi Vati', q: 'Brahmi' },
                { label: 'Joint Oils', q: 'Mahanarayan' },
                { label: 'Tulsi Drops', q: 'Tulsi' },
                { label: 'Kumkumadi Oil', q: 'Kumkumadi' },
              ].map(tag => (
                <button
                  key={tag.label}
                  type="button"
                  onClick={() => navigate(`/products?search=${encodeURIComponent(tag.q)}`)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-600 transition-colors shrink-0 cursor-pointer font-medium"
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 1. AMAZON-INSPIRED MULTI-CARD HERO SHOWCASE ─────────── */}
        <section aria-label="Featured Herbal Showcase" className="mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">

            {/* Card 1: Main Highlight - Natural Care & Herbal Beauty (Inspired by Beauty showcase) */}
            <div className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-amber-50/90 via-rose-50/50 to-emerald-50/60 border border-amber-200/60 p-5 sm:p-6 flex flex-col justify-between shadow-2xs hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className="relative z-10">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 mb-2.5">
                  <Leaf size={11} /> Botanical Apothecary
                </span>
                <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 leading-tight">
                  Shop all things natural care
                </h2>
                <p className="text-slate-600 text-xs sm:text-sm mt-1.5 max-w-sm">
                  Traditional preparations formulated with wild-harvested herbs, cold-pressed oils, and verified botanical purity.
                </p>
              </div>

              {/* 4 Quadrants Showcase inside the large card */}
              <div className="grid grid-cols-2 gap-2.5 my-4 relative z-10">
                <Link
                  to="/products?search=Ayurvedic"
                  className="bg-white/90 hover:bg-white p-2.5 rounded-xl border border-amber-100 flex items-center gap-2.5 transition-all group/item shadow-2xs"
                >
                  <span className="text-2xl shrink-0">🌿</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate group-hover/item:text-emerald-700">Pure Extracts</p>
                    <p className="text-[10px] text-slate-500">Root &amp; Leaf Vati</p>
                  </div>
                </Link>
                <Link
                  to="/products?search=Extracts"
                  className="bg-white/90 hover:bg-white p-2.5 rounded-xl border border-amber-100 flex items-center gap-2.5 transition-all group/item shadow-2xs"
                >
                  <span className="text-2xl shrink-0">🍃</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate group-hover/item:text-emerald-700">Herbal Syrups</p>
                    <p className="text-[10px] text-slate-500">Liver &amp; Throat</p>
                  </div>
                </Link>
                <Link
                  to="/products?search=Chyawanprash"
                  className="bg-white/90 hover:bg-white p-2.5 rounded-xl border border-amber-100 flex items-center gap-2.5 transition-all group/item shadow-2xs"
                >
                  <span className="text-2xl shrink-0">⚡</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate group-hover/item:text-emerald-700">Immunity Jams</p>
                    <p className="text-[10px] text-slate-500">Amla &amp; Saffron</p>
                  </div>
                </Link>
                <Link
                  to="/products?search=Kumkumadi"
                  className="bg-white/90 hover:bg-white p-2.5 rounded-xl border border-amber-100 flex items-center gap-2.5 transition-all group/item shadow-2xs"
                >
                  <span className="text-2xl shrink-0">✨</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate group-hover/item:text-emerald-700">Beauty Oils</p>
                    <p className="text-[10px] text-slate-500">Saffron Radiance</p>
                  </div>
                </Link>
              </div>

              <div className="relative z-10 pt-2 border-t border-amber-200/50 flex items-center justify-between">
                <Link
                  to="/products"
                  className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 group/btn"
                >
                  <span>Explore complete dispensary catalog</span>
                  <ArrowRight size={13} className="group-hover/btn:translate-x-1 transition-transform" />
                </Link>
                <span className="text-[11px] font-semibold text-slate-500">Pay on pickup</span>
              </div>
            </div>

            {/* Card 2: Best Selling Remedies */}
            <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 flex flex-col justify-between shadow-2xs hover:shadow-md transition-shadow">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                    <TrendingUp size={12} /> Patient Favorites
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">Top Rated</span>
                </div>
                <h3 className="font-display font-extrabold text-lg text-slate-900 leading-snug">
                  Best selling remedies
                </h3>

                {/* Best seller item showcase */}
                {bestSellers[0] && (
                  <Link
                    to={`/products/${bestSellers[0].id}`}
                    className="mt-3 block group/item"
                  >
                    <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 mb-2.5 border border-slate-100">
                      <img
                        src={bestSellers[0].images[0] || 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&q=80'}
                        alt={bestSellers[0].name}
                        className="w-full h-full object-cover group-hover/item:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                    <p className="text-xs font-bold text-slate-900 group-hover/item:text-emerald-700 line-clamp-1">
                      {bestSellers[0].name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-display font-extrabold text-sm text-emerald-800">
                        ₹{bestSellers[0].price}
                      </span>
                      {bestSellers[0].originalPrice && (
                        <span className="text-xs text-slate-400 line-through">
                          ₹{bestSellers[0].originalPrice}
                        </span>
                      )}
                      <span className="text-[11px] text-amber-600 font-bold ml-auto flex items-center gap-0.5">
                        <Star size={11} className="fill-amber-400 text-amber-400" />
                        {bestSellers[0].rating}
                      </span>
                    </div>
                  </Link>
                )}
              </div>

              <Link
                to="/products?sort=popularity"
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 pt-3 border-t border-slate-100 group/link mt-2"
              >
                <span>See all top remedies</span>
                <ChevronRight size={13} className="group-hover/link:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {/* Card 3: Special Offers Under ₹499 */}
            <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 flex flex-col justify-between shadow-2xs hover:shadow-md transition-shadow">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                    <Percent size={12} /> Daily Value
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800">Under ₹499</span>
                </div>
                <h3 className="font-display font-extrabold text-lg text-slate-900 leading-snug">
                  Special offers available
                </h3>

                {/* Offer item showcase */}
                {dealsUnder499[1] ? (
                  <Link
                    to={`/products/${dealsUnder499[1].id}`}
                    className="mt-3 block group/item"
                  >
                    <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 mb-2.5 border border-slate-100 relative">
                      <img
                        src={dealsUnder499[1].images[0] || 'https://images.unsplash.com/photo-1514733670139-4d87a1941d55?w=600&q=80'}
                        alt={dealsUnder499[1].name}
                        className="w-full h-full object-cover group-hover/item:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-emerald-700 text-white text-[10px] font-bold shadow-xs">
                        Save 20%+
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 group-hover/item:text-emerald-700 line-clamp-1">
                      {dealsUnder499[1].name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-display font-extrabold text-sm text-emerald-800">
                        ₹{dealsUnder499[1].price}
                      </span>
                      {dealsUnder499[1].originalPrice && (
                        <span className="text-xs text-slate-400 line-through">
                          ₹{dealsUnder499[1].originalPrice}
                        </span>
                      )}
                    </div>
                  </Link>
                ) : (
                  <div className="w-full aspect-[4/3] rounded-xl bg-slate-50 flex items-center justify-center text-xs text-slate-400 mt-3">
                    Curating daily offers…
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setActiveDealFilter('under-499')}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 pt-3 border-t border-slate-100 group/link mt-2 text-left cursor-pointer"
              >
                <span>View all deals under ₹499</span>
                <ChevronRight size={13} className="group-hover/link:translate-x-0.5 transition-transform" />
              </button>
            </div>

            {/* Card 4: Daily Immunity & Energy */}
            <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 flex flex-col justify-between shadow-2xs hover:shadow-md transition-shadow">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                    <Sparkles size={12} /> Daily Vitality
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">Immunity</span>
                </div>
                <h3 className="font-display font-extrabold text-lg text-slate-900 leading-snug">
                  Immunity must-haves
                </h3>

                {immunityVitality[0] && (
                  <Link
                    to={`/products/${immunityVitality[0].id}`}
                    className="mt-3 block group/item"
                  >
                    <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 mb-2.5 border border-slate-100">
                      <img
                        src={immunityVitality[0].images[0] || 'https://images.unsplash.com/photo-1577937927133-66ef06acdf18?w=600&q=80'}
                        alt={immunityVitality[0].name}
                        className="w-full h-full object-cover group-hover/item:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                    <p className="text-xs font-bold text-slate-900 group-hover/item:text-emerald-700 line-clamp-1">
                      {immunityVitality[0].name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-display font-extrabold text-sm text-emerald-800">
                        ₹{immunityVitality[0].price}
                      </span>
                      <span className="text-[11px] text-slate-500 ml-auto">Classical Amla</span>
                    </div>
                  </Link>
                )}
              </div>

              <Link
                to="/products?search=Vitality"
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 pt-3 border-t border-slate-100 group/link mt-2"
              >
                <span>Browse vitality tonics</span>
                <ChevronRight size={13} className="group-hover/link:translate-x-0.5 transition-transform" />
              </Link>
            </div>

          </div>

          {/* ── DEAL CATEGORY PILL STRIP (Amazon-style lower shelf) ── */}
          <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: 'All Remedies', badge: `${products.length}` },
              { id: 'under-299', label: 'Deals Under ₹299', badge: 'Budget Friendly' },
              { id: 'under-499', label: 'Deals Under ₹499', badge: 'Special' },
              { id: '4-star', label: '4.8+ Stars Rated', badge: 'Top Patient Choice' },
              { id: 'ayurvedic', label: 'Ayurvedic Formulations', badge: 'Classical' },
              { id: 'vitality', label: 'Immunity & Energy', badge: 'Wellness' },
            ].map(tab => {
              const active = activeDealFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveDealFilter(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    active
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-md font-semibold ${
                      active ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {tab.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── TRUST BADGES ─────────────────────────────────────── */}
        <div className="mb-10 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {TRUST_BADGES.map(({ icon: Icon, text, color, bg, border }) => (
            <span
              key={text}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${bg} ${color} border ${border} shadow-2xs whitespace-nowrap`}
            >
              <Icon size={13} className="shrink-0 text-emerald-700" />
              {text}
            </span>
          ))}
        </div>

        {/* ── 2. FILTERED / FEATURED PRODUCTS SECTION ───────────── */}
        <section aria-label="Catalog Products" className="mb-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-5">
            <div>
              <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase flex items-center gap-1">
                <Sparkles size={12} /> Curated Dispensary Stock
              </span>
              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 tracking-tight mt-0.5">
                {activeDealFilter === 'under-299' && 'Affordable Herbal Remedies Under ₹299'}
                {activeDealFilter === 'under-499' && 'Value Herbal Formulations Under ₹499'}
                {activeDealFilter === '4-star' && 'Highest Rated Ayurvedic Medicines (4.8+ ★)'}
                {activeDealFilter === 'ayurvedic' && 'Classical Ayurvedic Tablets & Vati'}
                {activeDealFilter === 'vitality' && 'Immunity, Rejuvenation & Vitality Tonics'}
                {activeDealFilter === 'all' && 'Trusted Natural & Ayurvedic Remedies'}
              </h2>
            </div>
            <Link
              to="/products"
              className="text-xs sm:text-sm font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 group shrink-0"
            >
              <span>View All Products ({products.length})</span>
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
          ) : displayedProducts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {displayedProducts.slice(0, 8).map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <Leaf size={40} className="text-emerald-300 mx-auto mb-3" />
              <p className="text-slate-700 text-sm font-semibold">No products found in this filter</p>
              <button
                type="button"
                onClick={() => setActiveDealFilter('all')}
                className="mt-2 text-xs font-bold text-emerald-700 underline cursor-pointer"
              >
                Reset filters to view all remedies
              </button>
            </div>
          )}
        </section>

        {/* ── 3. HERBAL CATEGORY COLLECTIONS ────────────────────── */}
        <section aria-label="Product Categories" className="mb-12 sm:mb-16">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-5">
            <div>
              <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase">Traditional Branches</span>
              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 tracking-tight mt-0.5">
                Our Herbal Collections
              </h2>
            </div>
            <Link
              to="/products"
              className="text-xs sm:text-sm font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 group shrink-0"
            >
              <span>Explore All Categories</span>
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
                <span className="text-[10px] text-slate-500 mt-1 leading-tight hidden sm:block">{cat.desc}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── 4. HOW CLICK AND COLLECT WORKS ────────────────────── */}
        <section aria-label="How Click and Collect Works" className="mb-12 sm:mb-16">
          <div className="bg-gradient-to-br from-emerald-50 via-teal-50/60 to-emerald-50/80 border border-emerald-200/80 rounded-2xl p-6 sm:p-8">
            <div className="text-center mb-6">
              <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase">Convenient Care</span>
              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 mt-1">
                Click &amp; Collect in 3 Simple Steps
              </h2>
              <p className="text-slate-600 text-xs sm:text-sm mt-1">
                Zero advance online payment required. Reserve online, collect and pay on the spot.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              {[
                {
                  step: '1',
                  title: 'Select Remedies Online',
                  desc: 'Browse our full herbal catalog and add needed formulations to your cart without upfront payment.',
                  icon: '🛒',
                  color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                },
                {
                  step: '2',
                  title: 'Confirm with Name & Phone',
                  desc: 'Sign in with your Google account. Enter your pickup name and phone number so we can prepare your order.',
                  icon: '📋',
                  color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                },
                {
                  step: '3',
                  title: 'Collect & Pay at Counter',
                  desc: 'Visit our dispensary counter when ready. Pay in person with cash or UPI upon inspecting your medicines.',
                  icon: '🏪',
                  color: 'bg-amber-100 text-amber-800 border-amber-200',
                },
              ].map(({ step, title, desc, icon, color }) => (
                <div key={step} className="flex flex-col items-center text-center gap-3 bg-white/70 backdrop-blur-xs p-5 rounded-2xl border border-emerald-100/80 shadow-2xs">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border ${color} shadow-2xs`}>
                    {icon}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-0.5">Step {step}</div>
                    <h3 className="font-display font-bold text-sm sm:text-base text-slate-900">{title}</h3>
                    <p className="text-slate-600 text-xs leading-relaxed mt-1">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/products"
                id="hero-primary-cta"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white text-sm font-semibold transition-colors shadow-sm"
              >
                <Leaf size={15} />
                <span>Browse Herbal Catalog</span>
                <ArrowRight size={14} />
              </Link>
              <Link
                to="/orders"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-emerald-200 text-emerald-900 hover:bg-emerald-50 text-sm font-semibold transition-colors shadow-2xs"
              >
                <span>View My Pickup Orders</span>
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        </section>

        {/* ── 5. MOVED DOWNWARDS: ORIGINAL HERO DISPENSARY BANNER ── */}
        <section aria-label="EMS Dispensary Commitment" className="mb-8">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 via-teal-950 to-emerald-950 text-white p-6 sm:p-10 shadow-lg">
            {/* Background ambient lighting */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -top-16 -right-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-teal-400/10 rounded-full blur-2xl" />
            </div>

            <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-400/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold mb-4">
                <Leaf size={13} className="shrink-0" />
                <span>EMS Natural Medicine Dispensary</span>
              </div>

              <h2 className="font-display font-extrabold text-[clamp(1.5rem,3.5vw,2.4rem)] tracking-tight leading-[1.15] mb-3">
                Nature's Healing,{' '}
                <span className="text-emerald-400">Dispensed with Care.</span>
              </h2>

              <p className="text-emerald-100/80 text-xs sm:text-sm leading-relaxed mb-6 max-w-lg">
                We believe in genuine, time-honored remedies. Every product in our dispensary is vetted for authenticity, botanical integrity, and potency.
                Reserve online today and pick up at your convenience.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/products"
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 text-xs sm:text-sm font-bold transition-colors shadow-sm inline-flex items-center gap-1.5"
                >
                  <Leaf size={14} />
                  <span>Start Your Order</span>
                </Link>
                <Link
                  to="/orders"
                  className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs sm:text-sm font-semibold transition-colors"
                >
                  <span>Check Order Status</span>
                </Link>
              </div>
            </div>

            {/* Dispensary Counter & Timing details */}
            <div className="relative z-10 mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 pt-5 border-t border-white/10">
              <div className="flex items-center gap-2 text-xs text-emerald-200">
                <MapPin size={14} className="text-emerald-400 shrink-0" />
                <span><strong className="text-white">Main Street Dispensary Counter</strong> — In-person collection &amp; UPI / cash</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald-200">
                <Clock size={14} className="text-emerald-400 shrink-0" />
                <span>Mon–Sat · 9:00 AM – 7:00 PM</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 6. STORE INFO STRIP ──────────────────────────────── */}
        <section aria-label="Store Information" className="mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                <MapPin size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Dispensary Location</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Visit us in person to collect your reserved medicine and pay directly at the counter.
                </p>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                <Clock size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Counter Hours</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Monday – Saturday: 9:00 AM – 7:00 PM<br />Sunday: Closed for inventory
                </p>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Botanical Promise</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  All preparations are genuine, unadulterated, and sourced from certified herbal makers.
                </p>
              </div>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
