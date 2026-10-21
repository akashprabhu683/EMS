import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ShieldCheck,
  Leaf,
  Search,
  MapPin,
  Clock,
  ChevronRight,
  FlaskConical,
  AlertCircle,
  Package,
} from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { useState, useEffect, useRef, useMemo } from 'react';
import { getActiveProducts } from '../services/productService';
import { getActiveCategories } from '../services/categoryService';
import { getUserOrders } from '../services/orderService';
import { useAuth } from '../context/AuthContext';
import type { Product, Order, Category } from '../types';

const TRUST_BADGES = [
  { icon: Leaf, text: 'Pure Botanical Herbs', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { icon: ShieldCheck, text: 'Store Verified', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { icon: FlaskConical, text: 'Lab Standardized', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { icon: MapPin, text: 'Click & Collect Counter', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
];

export function HomePage() {
  const { user, isAuthenticated } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [overdueOrders, setOverdueOrders] = useState<Order[]>([]);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // Check for uncollected orders ready for pickup > 24h
  useEffect(() => {
    let active = true;
    if (isAuthenticated && user?.id) {
      getUserOrders(user.id)
        .then(userOrders => {
          if (!active) return;
          const now = Date.now();
          const OVERDUE_MS = 24 * 60 * 60 * 1000;
          const overdue = (userOrders || []).filter(order => {
            if (order.status !== 'ready_for_pickup') return false;
            const placed = order.date ? new Date(order.date).getTime() : 0;
            return placed && now - placed > OVERDUE_MS;
          });
          setOverdueOrders(overdue);
        })
        .catch(console.warn);
    } else {
      setOverdueOrders([]);
    }
    return () => { active = false; };
  }, [isAuthenticated, user?.id]);

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

  // Fetch actual products and categories from Firestore
  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([getActiveProducts(), getActiveCategories()])
      .then(([remoteProducts, remoteCategories]) => {
        if (!active) return;
        setProducts(remoteProducts);
        setCategories(remoteCategories);
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  // Live suggestions pool derived dynamically from loaded products
  const liveSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const pool = new Set<string>();
    for (const p of products) {
      if (p.name.toLowerCase().includes(q)) pool.add(p.name);
      if (p.category && p.category.toLowerCase().includes(q)) pool.add(p.category);
      if (Array.isArray(p.tags)) {
        for (const t of p.tags) {
          if (t.toLowerCase().includes(q)) pool.add(t);
        }
      }
    }
    return Array.from(pool).slice(0, 6);
  }, [products, searchQuery]);

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

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIdx(-1);
      searchRef.current?.blur();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!showSuggestions) setShowSuggestions(true);
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

  // Filter products by selected category and limit homepage to 20 products
  const displayedProducts = useMemo(() => {
    const list = selectedCategory === 'all'
      ? products
      : products.filter(p => p.category === selectedCategory || (p as any).categorySlug === selectedCategory);
    return list.slice(0, 20);
  }, [products, selectedCategory]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-12">
      <div className="page-container pt-6 sm:pt-8 pb-4">

        {/* ── UNCOLLECTED / OVERDUE ORDER NOTIFICATION BANNER ── */}
        {overdueOrders.length > 0 && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200/90 shadow-xs flex items-start gap-3.5 animate-fade-in">
            <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
              <AlertCircle size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-amber-900 text-xs sm:text-sm">
                {overdueOrders.length === 1
                  ? 'Reminder: You have an order ready for collection at the store counter'
                  : `Reminder: You have ${overdueOrders.length} orders ready for collection`}
              </p>
              <p className="text-amber-800 text-xs mt-0.5 leading-relaxed">
                Order <strong className="font-semibold text-amber-950">{overdueOrders[0].id}</strong> is packed and awaiting collection. Please visit the store counter during opening hours (Mon–Sat 9AM–7PM) to collect and pay for your remedies.
              </p>
              <div className="flex items-center gap-3 mt-2.5">
                <Link
                  to={`/orders/${overdueOrders[0].id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold transition-colors"
                >
                  <Package size={12} />
                  View Pickup Details
                </Link>
                <Link
                  to="/orders"
                  className="text-xs font-semibold text-amber-900 hover:text-amber-950 underline underline-offset-2"
                >
                  All Orders ({overdueOrders.length})
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── TOP SEARCH BAR ─────────────────────────────────── */}
        <div className="mb-6 sm:mb-8">
          <div ref={searchWrapRef} className="bg-white rounded-2xl border border-slate-200/90 p-2 sm:p-3 shadow-xs relative">
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
                  placeholder="Search products by keyword, name, or tag..."
                  autoComplete="off"
                  aria-label="Search products"
                  aria-autocomplete="list"
                  aria-expanded={showSuggestions && liveSuggestions.length > 0}
                  className="w-full h-11 pl-10 pr-10 rounded-xl bg-slate-50 hover:bg-slate-100/80 focus:bg-white text-slate-900 placeholder-slate-400 text-xs sm:text-sm outline-none border border-slate-200 transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
                <kbd className="hidden sm:inline-flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 rounded pointer-events-none shadow-2xs">
                  /
                </kbd>
              </div>
              <button
                type="submit"
                id="top-hero-search-btn"
                className="h-11 px-5 sm:px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white text-xs sm:text-sm font-semibold transition-colors shadow-2xs shrink-0 flex items-center gap-2 cursor-pointer"
              >
                <Search size={16} />
                <span className="hidden sm:inline">Search</span>
              </button>
            </form>

            {/* Live suggestions dropdown */}
            {showSuggestions && liveSuggestions.length > 0 && (
              <ul
                role="listbox"
                className="absolute left-2 right-2 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1.5 overflow-hidden"
              >
                {liveSuggestions.map((suggestion, i) => {
                  const q = searchQuery.trim().toLowerCase();
                  const idx = suggestion.toLowerCase().indexOf(q);
                  return (
                    <li key={suggestion} role="option" aria-selected={i === selectedIdx}>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(suggestion); }}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-xs sm:text-sm transition-colors text-left cursor-pointer ${
                          i === selectedIdx
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-800'
                        }`}
                      >
                        <Search size={13} className="text-emerald-600 shrink-0" />
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

        {/* ── CATEGORY NAVIGATION PILLS ──────────────────────────── */}
        <div id="catalog-section" className="mb-6 sm:mb-8 overflow-x-auto pb-2 scrollbar-none scroll-mt-20">
          <div className="flex items-center gap-2 min-w-max">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              All Products ({products.length})
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedCategory === cat.id
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>{cat.icon || '🌿'}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── DYNAMIC PRODUCT CATALOG (2 COLUMNS ON MOBILE) ────────── */}
        <section aria-label="Product Catalog" className="mb-14 sm:mb-16">
          <div className="flex items-center justify-between gap-2 mb-4 sm:mb-6">
            <div>
              <h2 className="font-display font-extrabold text-lg sm:text-2xl text-slate-900 tracking-tight">
                {selectedCategory === 'all'
                  ? 'Available Catalog'
                  : categories.find(c => c.id === selectedCategory)?.name || 'Filtered Products'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Showing {displayedProducts.length} authentic formulations in stock
              </p>
            </div>
            <Link
              to="/products"
              className="text-xs sm:text-sm font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 group shrink-0"
            >
              <span>All Products &amp; Filters</span>
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {loading ? (
            /* Loading skeletons: 2 columns on mobile, 3 on tablet, 4 on desktop */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="rounded-2xl bg-white border border-slate-200 p-3 sm:p-4 animate-pulse flex flex-col h-full">
                  <div className="w-full aspect-[4/3] bg-slate-100 rounded-xl mb-3" />
                  <div className="h-3 bg-slate-100 rounded mb-2 w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2 mb-3" />
                  <div className="mt-auto h-8 bg-slate-100 rounded-lg" />
                </div>
              ))}
            </div>
          ) : displayedProducts.length > 0 ? (
            /* Responsive product grid: 2 columns on mobile, 3 on tablet, 4 on desktop */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
              {displayedProducts.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
              <Package size={40} className="text-slate-300 mx-auto" />
              <p className="text-slate-800 font-bold text-sm">No products found</p>
              <p className="text-slate-500 text-xs max-w-sm mx-auto">
                No active products match the selected category. New products uploaded in the admin panel appear here automatically.
              </p>
              <button
                onClick={() => setSelectedCategory('all')}
                className="mt-2 btn-secondary py-2 px-4 text-xs rounded-xl"
              >
                Show All Products
              </button>
            </div>
          )}
        </section>

        {/* ── CONVENIENT CARE: CLICK & COLLECT IN 3 SIMPLE STEPS ─── */}
        <section id="how-it-works" aria-label="How Click and Collect Works" className="mb-14 sm:mb-16 scroll-mt-20">
          <div className="bg-gradient-to-br from-emerald-50 via-teal-50/60 to-emerald-50/80 border border-emerald-200/80 rounded-2xl p-5 sm:p-8">
            <div className="text-center mb-6">
              <span className="text-[10px] sm:text-xs font-bold text-emerald-700 tracking-wider uppercase">Convenient Care</span>
              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 mt-1">
                Click &amp; Collect in 3 Simple Steps
              </h2>
              <p className="text-slate-600 text-xs sm:text-sm mt-1 max-w-lg mx-auto">
                Zero advance online payment required. Reserve online, collect and pay on the spot at THANGAM STORES.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5">
              {[
                {
                  step: '1',
                  title: 'Select Products Online',
                  desc: 'Browse our actual live catalog and add needed formulations to your cart without upfront payment.',
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
                  desc: 'Visit our store counter when ready. Pay in person with cash or UPI upon inspecting your medicines.',
                  color: 'bg-amber-100 text-amber-800 border-amber-200',
                },
              ].map(({ step, title, desc, color }) => (
                <div key={step} className="flex flex-col items-center text-center gap-2.5 bg-white/80 backdrop-blur-xs p-4 sm:p-5 rounded-2xl border border-emerald-100/80 shadow-2xs">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-display font-extrabold text-base border ${color} shadow-2xs`}>
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

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/products"
                id="hero-primary-cta"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white text-xs sm:text-sm font-semibold transition-colors shadow-sm"
              >
                <Leaf size={14} />
                <span>Browse All Products</span>
                <ArrowRight size={13} />
              </Link>
              <Link
                to="/orders"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-emerald-200 text-emerald-900 hover:bg-emerald-50 text-xs sm:text-sm font-semibold transition-colors shadow-2xs"
              >
                <span>View My Orders</span>
                <ChevronRight size={13} />
              </Link>
            </div>
          </div>
        </section>

        {/* ── STORE INFORMATION STRIP ──────────────────────────────── */}
        <section id="store-info" aria-label="Store Information" className="mb-4 scroll-mt-20">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                <MapPin size={18} />
              </div>
              <div>
                <h3 className="font-bold text-xs sm:text-sm text-slate-900">THANGAM STORES Counter</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Visit us in person to collect your reserved medicine and pay directly at the counter.
                </p>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                <Clock size={18} />
              </div>
              <div>
                <h3 className="font-bold text-xs sm:text-sm text-slate-900">Counter Hours</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Monday – Saturday: 9:00 AM – 7:00 PM<br />Sunday: Closed
                </p>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h3 className="font-bold text-xs sm:text-sm text-slate-900">Authentic Promise</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  All formulations are genuine, unadulterated, and sourced directly from certified makers.
                </p>
              </div>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
