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
} from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { useState, useEffect, useRef } from 'react';
import { getActiveProducts } from '../services/productService';
import { PRODUCTS } from '../data/products';
import type { Product } from '../types';

/* ─── Herbal categories aligned with dispensary catalog ─── */
const HERBAL_CATEGORIES = [
  { slug: 'ayurvedic',       label: 'Ayurvedic Formulations' },
  { slug: 'herbal-extracts', label: 'Herbal Extracts & Syrups' },
  { slug: 'vitality',        label: 'Vitality & Immunity' },
  { slug: 'digestive',       label: 'Digestive & Metabolism' },
  { slug: 'joint-care',      label: 'Joint Care & Balms' },
  { slug: 'wellness-teas',   label: 'Natural Wellness & Teas' },
];

const TRUST_BADGES = [
  { icon: Leaf,         text: 'Pure Botanical Herbs',    color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { icon: ShieldCheck,  text: 'Dispensary Verified',     color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { icon: FlaskConical, text: 'Lab Standardized',        color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { icon: MapPin,       text: 'Click & Collect Counter', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
];

export function HomePage() {
  const [products, setProducts]               = useState<Product[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [searchQuery, setSearchQuery]         = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx]         = useState(-1);
  const navigate      = useNavigate();
  const searchRef     = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setSelectedIdx(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Open search bar with '/' global shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault();
          searchWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          searchRef.current?.focus();
          setShowSuggestions(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Live suggestions pool (derived from product catalogue)
  const ALL_SUGGESTIONS = [
    'Ashwagandha', 'Ashwagandha Ghanvati', 'Stress Relief', 'Sleep Support',
    'Triphala', 'Triphala Churna', 'Digestive Health', 'Detox', 'Colon Cleanse',
    'Chyawanprash', 'Immunity Booster', 'Amla', 'Wild Herbs',
    'Brahmi', 'Brahmi Vati', 'Memory', 'Cognitive Focus', 'Mental Clarity',
    'Tulsi', 'Panch Tulsi', 'Holy Basil', 'Respiratory Care', 'Tulsi Drops',
    'Giloy', 'Giloy Ghanvati', 'Guduchi', 'Blood Purifier', 'Immunity',
    'Mahanarayan Oil', 'Joint Care', 'Pain Relief', 'Muscle Soreness',
    'Kumkumadi', 'Kumkumadi Tailam', 'Saffron', 'Skin Glow', 'Beauty Oil',
    'Shatavari', 'Women Health', 'Hormonal Balance', 'Lactation Support',
    'Herbal Tea', 'Sleep Tea', 'Chamomile', 'Serenity', 'Relaxation',
    'Liver Tonic', 'Liv-Care', 'Liver Syrup', 'Bhumi Amla', 'Hepatic Support',
    'Neem', 'Turmeric', 'Wild Turmeric', 'Skin Health', 'Acne Care',
    'Ayurvedic', 'Herbal Extracts', 'Vitality', 'Wellness', 'Natural',
  ];

  const liveSuggestions =
    searchQuery.trim().length > 0
      ? ALL_SUGGESTIONS.filter(s =>
          s.toLowerCase().includes(searchQuery.trim().toLowerCase())
        ).slice(0, 7)
      : [];

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
    const term = selectedIdx >= 0 && liveSuggestions[selectedIdx]
      ? liveSuggestions[selectedIdx]
      : searchQuery.trim();
    if (term) {
      navigate(`/products?search=${encodeURIComponent(term)}`);
      setShowSuggestions(false);
      setSearchQuery('');
      setSelectedIdx(-1);
    }
  };

  const handleSuggestionClick = (q: string) => {
    navigate(`/products?search=${encodeURIComponent(q)}`);
    setSearchQuery('');
    setShowSuggestions(false);
    setSelectedIdx(-1);
  };

  // Keyboard navigation inside the hero search: enter, esc, arrow up, down
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIdx(-1);
      searchRef.current?.blur();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!showSuggestions) {
        setShowSuggestions(true);
      }
      if (liveSuggestions.length > 0) {
        setSelectedIdx(i => Math.min(i + 1, liveSuggestions.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (liveSuggestions.length > 0) {
        setSelectedIdx(i => Math.max(i - 1, -1));
      }
    } else if (e.key === 'Enter') {
      if (selectedIdx >= 0 && liveSuggestions[selectedIdx]) {
        e.preventDefault();
        handleSuggestionClick(liveSuggestions[selectedIdx]);
      }
    }
  };

  // Guaranteed product selection so hero cards are NEVER empty
  const catalogPool = products.length > 0 ? products : PRODUCTS;
  const bestSellerProduct =
    catalogPool.find(p => p.rating >= 4.8) ||
    catalogPool.find(p => p.featured) ||
    catalogPool[0] ||
    PRODUCTS[0];

  const dealProduct =
    catalogPool.find(p => p.price <= 499 && p.id !== bestSellerProduct?.id) ||
    catalogPool.find(p => p.id !== bestSellerProduct?.id) ||
    catalogPool[1] ||
    PRODUCTS[1];

  const immunityProduct =
    catalogPool.find(p =>
      p.id !== bestSellerProduct?.id &&
      p.id !== dealProduct?.id &&
      (p.category?.toLowerCase().includes('vitality') ||
       p.category?.toLowerCase().includes('extract') ||
       p.tags?.some(t => t.includes('immunity') || t.includes('vitality')))
    ) ||
    catalogPool.find(p => p.id !== bestSellerProduct?.id && p.id !== dealProduct?.id) ||
    catalogPool[2] ||
    PRODUCTS[2];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-12">
      <div className="page-container pt-8 sm:pt-10 pb-4">

        {/* ── TOP HERO SEARCH BAR ─────────────────────────────────── */}
        <div className="mb-12 sm:mb-16">
          <div ref={searchWrapRef} className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-xs relative">
            <form onSubmit={handleSearch} className="flex items-center gap-2" role="search">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  ref={searchRef}
                  id="top-hero-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setShowSuggestions(true); setSelectedIdx(-1); }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="search products"
                  autoComplete="off"
                  aria-label="Search products"
                  aria-autocomplete="list"
                  aria-expanded={showSuggestions && liveSuggestions.length > 0}
                  className="w-full h-11 pl-10 pr-10 rounded-xl bg-slate-50 hover:bg-slate-100/80 focus:bg-white text-slate-900 placeholder-slate-400 text-sm outline-none border border-slate-200 transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
                <kbd className="hidden sm:inline-flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 rounded pointer-events-none shadow-2xs">
                  /
                </kbd>
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

            {/* Live suggestions dropdown */}
            {showSuggestions && liveSuggestions.length > 0 && (
              <ul
                role="listbox"
                className="absolute left-3 right-3 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1.5 overflow-hidden"
              >
                {liveSuggestions.map((suggestion, i) => {
                  const q   = searchQuery.trim().toLowerCase();
                  const idx = suggestion.toLowerCase().indexOf(q);
                  return (
                    <li key={suggestion} role="option" aria-selected={i === selectedIdx}>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(suggestion); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left group cursor-pointer ${
                          i === selectedIdx
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-800'
                        }`}
                      >
                        <Search size={13} className={`shrink-0 transition-colors ${
                          i === selectedIdx ? 'text-emerald-600' : 'text-slate-400 group-hover:text-emerald-600'
                        }`} />
                        <span>
                          {idx === -1 ? suggestion : (
                            <>
                              {suggestion.slice(0, idx)}
                              <strong className="font-semibold text-emerald-700">
                                {suggestion.slice(idx, idx + q.length)}
                              </strong>
                              {suggestion.slice(idx + q.length)}
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ── 1. HERO SHOWCASE (4 CARDS — NEVER EMPTY, NO EMOJIS) ──── */}
        <section aria-label="Featured Herbal Showcase" className="mb-16 sm:mb-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">

            {/* Card 1: Apothecary Highlights (No Emojis) */}
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

              {/* 4 Quadrant clean text links */}
              <div className="grid grid-cols-2 gap-2.5 my-4 relative z-10">
                <Link to="/products?search=Ayurvedic" className="bg-white/90 hover:bg-white p-3 rounded-xl border border-amber-100 flex flex-col gap-0.5 transition-all group/item shadow-2xs">
                  <span className="text-xs font-bold text-slate-800 group-hover/item:text-emerald-700">Pure Extracts</span>
                  <span className="text-[10px] text-slate-500">Root &amp; Leaf Vati</span>
                </Link>
                <Link to="/products?search=Extracts" className="bg-white/90 hover:bg-white p-3 rounded-xl border border-amber-100 flex flex-col gap-0.5 transition-all group/item shadow-2xs">
                  <span className="text-xs font-bold text-slate-800 group-hover/item:text-emerald-700">Herbal Syrups</span>
                  <span className="text-[10px] text-slate-500">Liver &amp; Throat</span>
                </Link>
                <Link to="/products?search=Chyawanprash" className="bg-white/90 hover:bg-white p-3 rounded-xl border border-amber-100 flex flex-col gap-0.5 transition-all group/item shadow-2xs">
                  <span className="text-xs font-bold text-slate-800 group-hover/item:text-emerald-700">Immunity Jams</span>
                  <span className="text-[10px] text-slate-500">Amla &amp; Saffron</span>
                </Link>
                <Link to="/products?search=Kumkumadi" className="bg-white/90 hover:bg-white p-3 rounded-xl border border-amber-100 flex flex-col gap-0.5 transition-all group/item shadow-2xs">
                  <span className="text-xs font-bold text-slate-800 group-hover/item:text-emerald-700">Beauty Oils</span>
                  <span className="text-[10px] text-slate-500">Saffron Radiance</span>
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

            {/* Card 2: Best Selling Remedies — Guaranteed Filled */}
            <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 flex flex-col justify-between shadow-2xs hover:shadow-md transition-shadow">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                    <TrendingUp size={12} /> Patient Favorites
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">Top Rated</span>
                </div>
                <h3 className="font-display font-extrabold text-lg text-slate-900 leading-snug">Best selling remedies</h3>

                <Link to={`/products/${bestSellerProduct.id}`} className="mt-3 block group/item">
                  <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 mb-2.5 border border-slate-100">
                    <img
                      src={bestSellerProduct.images[0] || 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&q=80'}
                      alt={bestSellerProduct.name}
                      className="w-full h-full object-cover group-hover/item:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <p className="text-xs font-bold text-slate-900 group-hover/item:text-emerald-700 line-clamp-1">
                    {bestSellerProduct.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-display font-extrabold text-sm text-emerald-800">
                      ₹{bestSellerProduct.price}
                    </span>
                    {bestSellerProduct.originalPrice && (
                      <span className="text-xs text-slate-400 line-through">₹{bestSellerProduct.originalPrice}</span>
                    )}
                    <span className="text-[11px] text-amber-600 font-bold ml-auto flex items-center gap-0.5">
                      <Star size={11} className="fill-amber-400 text-amber-400" />
                      {bestSellerProduct.rating || '4.9'}
                    </span>
                  </div>
                </Link>
              </div>
              <Link
                to="/products"
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 pt-3 border-t border-slate-100 group/link mt-2"
              >
                <span>See all top remedies</span>
                <ChevronRight size={13} className="group-hover/link:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {/* Card 3: Special Offers Available — Guaranteed Filled */}
            <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 flex flex-col justify-between shadow-2xs hover:shadow-md transition-shadow">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                    <Percent size={12} /> Daily Value
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800">Under ₹499</span>
                </div>
                <h3 className="font-display font-extrabold text-lg text-slate-900 leading-snug">Special offers available</h3>

                <Link to={`/products/${dealProduct.id}`} className="mt-3 block group/item">
                  <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 mb-2.5 border border-slate-100 relative">
                    <img
                      src={dealProduct.images[0] || 'https://images.unsplash.com/photo-1514733670139-4d87a1941d55?w=600&q=80'}
                      alt={dealProduct.name}
                      className="w-full h-full object-cover group-hover/item:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-emerald-700 text-white text-[10px] font-bold shadow-xs">
                      Save 20%+
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-900 group-hover/item:text-emerald-700 line-clamp-1">
                    {dealProduct.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-display font-extrabold text-sm text-emerald-800">
                      ₹{dealProduct.price}
                    </span>
                    {dealProduct.originalPrice && (
                      <span className="text-xs text-slate-400 line-through">₹{dealProduct.originalPrice}</span>
                    )}
                  </div>
                </Link>
              </div>
              <Link
                to="/products"
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 pt-3 border-t border-slate-100 group/link mt-2 text-left"
              >
                <span>View all deals under ₹499</span>
                <ChevronRight size={13} className="group-hover/link:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {/* Card 4: Daily Vitality & Immunity — Guaranteed Filled */}
            <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 flex flex-col justify-between shadow-2xs hover:shadow-md transition-shadow">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                    <Sparkles size={12} /> Daily Vitality
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">Immunity</span>
                </div>
                <h3 className="font-display font-extrabold text-lg text-slate-900 leading-snug">Immunity must-haves</h3>

                <Link to={`/products/${immunityProduct.id}`} className="mt-3 block group/item">
                  <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 mb-2.5 border border-slate-100">
                    <img
                      src={immunityProduct.images[0] || 'https://images.unsplash.com/photo-1577937927133-66ef06acdf18?w=600&q=80'}
                      alt={immunityProduct.name}
                      className="w-full h-full object-cover group-hover/item:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <p className="text-xs font-bold text-slate-900 group-hover/item:text-emerald-700 line-clamp-1">
                    {immunityProduct.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-display font-extrabold text-sm text-emerald-800">
                      ₹{immunityProduct.price}
                    </span>
                    <span className="text-[11px] text-amber-600 font-bold ml-auto flex items-center gap-0.5">
                      <Star size={11} className="fill-amber-400 text-amber-400" />
                      {immunityProduct.rating || '4.9'}
                    </span>
                  </div>
                </Link>
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
        </section>

        {/* ── TRUST BADGES ─────────────────────────────────────── */}
        <div className="mb-16 sm:mb-20 flex flex-wrap items-center justify-center gap-2.5 sm:gap-4">
          {TRUST_BADGES.map(({ icon: Icon, text, color, bg, border }) => (
            <span
              key={text}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold ${bg} ${color} border ${border} shadow-2xs whitespace-nowrap`}
            >
              <Icon size={14} className="shrink-0 text-emerald-700" />
              {text}
            </span>
          ))}
        </div>

        {/* ── 2. ALL PRODUCTS SECTION (NO FILTER PILLS) ───────────── */}
        <section aria-label="Catalog Products" className="mb-16 sm:mb-20">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6">
            <div>
              <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase flex items-center gap-1">
                <Sparkles size={12} /> Curated Dispensary Stock
              </span>
              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 tracking-tight mt-0.5">
                Trusted Natural &amp; Ayurvedic Remedies
              </h2>
            </div>
            <Link
              to="/products"
              className="text-xs sm:text-sm font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 group shrink-0"
            >
              <span>View All Products ({products.length > 0 ? products.length : PRODUCTS.length})</span>
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
          ) : catalogPool.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {catalogPool.slice(0, 8).map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <Leaf size={40} className="text-emerald-300 mx-auto mb-3" />
              <p className="text-slate-700 text-sm font-semibold">No products available at the moment</p>
              <Link to="/products" className="mt-2 text-xs font-bold text-emerald-700 underline">Browse all products</Link>
            </div>
          )}
        </section>

        {/* ── 3. HERBAL CATEGORIES — CLEAN TEXT LIST (TITLE: Herbal Collections) ── */}
        <section aria-label="Product Categories" className="mb-16 sm:mb-20">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-5">
            <div>
              <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase">Browse by Type</span>
              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 tracking-tight mt-0.5">
                Herbal Collections
              </h2>
            </div>
            <Link
              to="/products"
              className="text-xs sm:text-sm font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 group shrink-0"
            >
              <span>Explore All</span>
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
            {HERBAL_CATEGORIES.map(cat => (
              <Link
                key={cat.slug}
                to={`/products?search=${encodeURIComponent(cat.label)}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-emerald-50/50 transition-colors group first:rounded-t-2xl last:rounded-b-2xl cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  </span>
                  <span className="text-sm font-medium text-slate-800 group-hover:text-emerald-800 transition-colors">{cat.label}</span>
                </div>
                <ChevronRight size={15} className="text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
              </Link>
            ))}
          </div>
        </section>

        {/* ── 4. CONVENIENT CARE: CLICK & COLLECT IN 3 SIMPLE STEPS ─── */}
        <section aria-label="How Click and Collect Works" className="mb-16 sm:mb-20">
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
                  color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                },
                {
                  step: '2',
                  title: 'Confirm with Name & Phone',
                  desc: 'Sign in with your Google account. Enter your pickup name and phone number so we can prepare your order.',
                  color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                },
                {
                  step: '3',
                  title: 'Collect & Pay at Counter',
                  desc: 'Visit our dispensary counter when ready. Pay in person with cash or UPI upon inspecting your medicines.',
                  color: 'bg-amber-100 text-amber-800 border-amber-200',
                },
              ].map(({ step, title, desc, color }) => (
                <div key={step} className="flex flex-col items-center text-center gap-3 bg-white/70 backdrop-blur-xs p-5 rounded-2xl border border-emerald-100/80 shadow-2xs">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-display font-extrabold text-lg border ${color} shadow-2xs`}>
                    {step}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-0.5">Step {step}</div>
                    <h3 className="font-display font-bold text-sm sm:text-base text-slate-900">{title}</h3>
                    <p className="text-slate-600 text-xs leading-relaxed mt-1">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/products"
                id="hero-primary-cta"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white text-sm font-semibold transition-colors shadow-sm"
              >
                <Leaf size={15} />
                <span>Browse Herbal Products</span>
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

        {/* ── 5. DISPENSARY COMMITMENT HERO BANNER (AT BOTTOM) ──────── */}
        <section aria-label="EMS Dispensary Commitment" className="mb-16 sm:mb-20">
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
        <section aria-label="Store Information" className="mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
