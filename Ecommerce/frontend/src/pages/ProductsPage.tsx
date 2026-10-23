import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { SlidersHorizontal, X, ChevronDown, Grid3X3, List, Search, Star, ArrowRight, Package } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { SEO } from '../components/SEO';
import type { FilterState, SortOption, Category, Product } from '../types';
import clsx from 'clsx';
import { useCart } from '../context/CartContext';
import { getActiveProducts } from '../services/productService';
import { getActiveCategories } from '../services/categoryService';

const PRICE_MAX = 50000;

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'featured', label: 'Featured Picks' },
  { value: 'newest', label: 'Newest Arrivals' },
  { value: 'price-asc', label: 'Price: Low → High' },
  { value: 'price-desc', label: 'Price: High → Low' },
  { value: 'rating', label: 'Top Customer Rating' },
];

export function ProductsPage() {
  const [params] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { addItem, openCart } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.all([getActiveProducts(), getActiveCategories()])
      .then(([remoteProducts, remoteCategories]) => {
        if (active) {
          setProducts(remoteProducts);
          // calculate counts from remote products
          const catsWithCounts = remoteCategories.map(cat => ({
            ...cat,
            count: remoteProducts.filter(p => p.category === cat.id || p.category === cat.name).length
          }));
          setCategories(catsWithCounts);
        }
      })
      .catch(error => {
        console.error('Failed to load Firestore products or categories:', error);
      })
      .finally(() => {
        if (active) setProductsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const catParam = params.get('category');
  const searchParam = params.get('search');
  const [prevParamsKey, setPrevParamsKey] = useState(() => `${catParam ?? ''}::${searchParam ?? ''}`);

  const [filters, setFilters] = useState<FilterState>({
    categories: catParam ? [catParam] : [],
    priceRange: [0, PRICE_MAX],
    rating: 0,
    inStock: false,
    sortBy: 'featured',
    search: searchParam ?? '',
  });

  const currentParamsKey = `${catParam ?? ''}::${searchParam ?? ''}`;
  if (prevParamsKey !== currentParamsKey) {
    setPrevParamsKey(currentParamsKey);
    setFilters(f => ({
      ...f,
      categories: catParam ? [catParam] : [],
      search: searchParam ?? '',
    }));
  }

  const filtered = useMemo(() => {
    let list = [...products];

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some(t => t.includes(q))
      );
    }
    if (filters.categories.length > 0) {
      list = list.filter(p => filters.categories.includes(p.category));
    }
    list = list.filter(p => p.price >= filters.priceRange[0] && p.price <= filters.priceRange[1]);
    if (filters.rating > 0) list = list.filter(p => p.rating >= filters.rating);
    if (filters.inStock) list = list.filter(p => p.stock > 0);

    switch (filters.sortBy) {
      case 'price-asc': list.sort((a, b) => a.price - b.price); break;
      case 'price-desc': list.sort((a, b) => b.price - a.price); break;
      case 'rating': list.sort((a, b) => b.rating - a.rating); break;
      case 'newest': list.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0)); break;
      case 'featured': list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0)); break;
    }
    return list;
  }, [filters, products]);

  const toggleCategory = (id: string) =>
    setFilters(f => ({
      ...f,
      categories: f.categories.includes(id)
        ? f.categories.filter(c => c !== id)
        : [...f.categories, id],
    }));

  const clearFilters = () =>
    setFilters({ categories: [], priceRange: [0, PRICE_MAX], rating: 0, inStock: false, sortBy: 'featured', search: '' });

  const activeFilterCount =
    filters.categories.length +
    (filters.rating > 0 ? 1 : 0) +
    (filters.inStock ? 1 : 0) +
    (filters.priceRange[1] < PRICE_MAX ? 1 : 0);

  const activeCategoryName = filters.categories.length === 1
    ? categories.find(c => c.id === filters.categories[0] || c.name.toLowerCase() === filters.categories[0].toLowerCase())?.name
    : null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <SEO
        title={
          filters.search
            ? `Search: "${filters.search}" — Herbal Catalog`
            : activeCategoryName
              ? `${activeCategoryName} Formulations`
              : 'All Herbal Formulations & Natural Remedies'
        }
        description="Browse authentic Ayurvedic churnas, herbal tonics, single-herb powders, and dietary extracts. Reserve online for counter pickup at THANGAM STORES."
        canonical="https://ecommerce-storefront-client.vercel.app/products"
      />
      <div className="page-container pt-6 sm:pt-8 pb-4">

        {/* Page Header */}
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200/90 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-2 font-medium">
              <Link to="/" className="hover:text-slate-900 transition-colors">Home</Link>
              <span>/</span>
              <span className="text-slate-900">
                {activeCategoryName ?? 'All Products'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-display font-extrabold text-slate-900 tracking-tight">
              {filters.search ? (
                <>Search: <span className="text-emerald-700">"{filters.search}"</span></>
              ) : activeCategoryName ? (
                activeCategoryName
              ) : (
                'All Products'
              )}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1.5">
              Showing {filtered.length} of {products.length} curated products
            </p>
          </div>

          {/* Quick Clear All if any filters active */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-xs sm:text-sm font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1.5 self-start sm:self-end px-3 py-1.5 bg-rose-50 border border-rose-200/70 rounded-xl transition-colors shadow-2xs"
            >
              <X size={14} /> Reset Filters ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Search Bar & Controls Toolbar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 mb-8">
          {/* Search Input */}
          <div className="relative flex-1 max-w-xl">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="products-search-input"
              type="text"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              placeholder="Filter by keyword, product name, or tag…"
              className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 shadow-2xs transition-all"
            />
            {filters.search && (
              <button
                onClick={() => setFilters(f => ({ ...f, search: '' }))}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                aria-label="Clear search input"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Controls: Filter Toggle, Sort, Grid/List */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              id="filter-panel-toggle"
              onClick={() => setFiltersOpen(v => !v)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-2xs border',
                filtersOpen
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              )}
            >
              <SlidersHorizontal size={15} />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-emerald-700 text-white text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Sort Select */}
            <div className="relative">
              <select
                id="products-sort-select"
                value={filters.sortBy}
                onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value as SortOption }))}
                className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs sm:text-sm font-medium pl-3.5 pr-9 py-2.5 rounded-xl outline-none cursor-pointer shadow-2xs hover:border-slate-300 focus:border-emerald-600 transition-colors"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} className="text-slate-900">{o.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* View Mode Toggle */}
            <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
              <button
                id="view-grid-btn"
                onClick={() => setViewMode('grid')}
                className={clsx(
                  'p-2 rounded-lg transition-colors',
                  viewMode === 'grid' ? 'bg-slate-100 text-slate-900 font-bold shadow-2xs' : 'text-slate-400 hover:text-slate-700'
                )}
                aria-label="Grid view"
              >
                <Grid3X3 size={16} />
              </button>
              <button
                id="view-list-btn"
                onClick={() => setViewMode('list')}
                className={clsx(
                  'p-2 rounded-lg transition-colors',
                  viewMode === 'list' ? 'bg-slate-100 text-slate-900 font-bold shadow-2xs' : 'text-slate-400 hover:text-slate-700'
                )}
                aria-label="List view"
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Content Layout: Filter Sidebar + Products Grid */}
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 items-start">
          {/* Flat 2.0 Filter Sidebar with generous hit targets and spacing */}
          {filtersOpen && (
            <aside className="w-full lg:w-72 xl:w-80 shrink-0 space-y-5">
              {/* Categories */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-2xs">
                <h3 className="text-slate-900 font-bold text-xs uppercase tracking-wider mb-4">Categories</h3>
                <ul className="space-y-1.5">
                  {categories.map(cat => (
                    <li key={cat.id}>
                      <label
                        htmlFor={`cat-${cat.id}`}
                        className="flex items-center justify-between py-2 px-2.5 rounded-xl hover:bg-slate-50 cursor-pointer text-xs sm:text-sm text-slate-700 transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            id={`cat-${cat.id}`}
                            type="checkbox"
                            checked={filters.categories.includes(cat.id)}
                            onChange={() => toggleCategory(cat.id)}
                            className="accent-emerald-700 w-4 h-4 rounded cursor-pointer"
                          />
                          <span className="font-medium group-hover:text-emerald-700 transition-colors truncate">
                            {cat.name}
                          </span>
                        </div>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-700 transition-colors shrink-0">
                          {cat.count}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Price Range */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-2xs">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-slate-900 font-bold text-xs uppercase tracking-wider">Price Ceiling</h3>
                  <div className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    Up to ₹{filters.priceRange[1]}
                  </div>
                </div>
                <div className="flex justify-between text-xs text-slate-500 mb-2">
                  <span>₹{filters.priceRange[0]}</span>
                  <span>₹{PRICE_MAX}</span>
                </div>
                <input
                  id="price-range-slider"
                  type="range"
                  min={0}
                  max={PRICE_MAX}
                  value={filters.priceRange[1]}
                  onChange={e => setFilters(f => ({ ...f, priceRange: [f.priceRange[0], +e.target.value] }))}
                  className="w-full accent-emerald-700 cursor-pointer h-2 bg-slate-200 rounded-lg"
                />
              </div>

              {/* Rating Filter */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-2xs">
                <h3 className="text-slate-900 font-bold text-xs uppercase tracking-wider mb-3">Minimum Rating</h3>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 3, 4, 4.5].map(r => (
                    <button
                      key={r}
                      id={`rating-filter-${r}`}
                      onClick={() => setFilters(f => ({ ...f, rating: r }))}
                      className={clsx(
                        'py-2 rounded-xl text-xs font-semibold transition-all border focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                        filters.rating === r
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      )}
                    >
                      {r === 0 ? 'All' : `${r}★`}
                    </button>
                  ))}
                </div>
              </div>

              {/* In Stock Toggle */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
                <label
                  htmlFor="in-stock-filter"
                  className="flex items-center justify-between cursor-pointer text-xs sm:text-sm font-medium text-slate-700 py-1"
                >
                  <span>Show In-Stock Only</span>
                  <input
                    id="in-stock-filter"
                    type="checkbox"
                    checked={filters.inStock}
                    onChange={e => setFilters(f => ({ ...f, inStock: e.target.checked }))}
                    className="accent-emerald-700 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
              </div>
            </aside>
          )}

          {/* Product Grid Area with Graceful Handling for Sparse Results */}
          <div className="flex-1 min-w-0 w-full">
            {productsLoading && products.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Loading products...
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 sm:p-16 text-center space-y-4 shadow-2xs">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
                  <Package size={28} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">No matching products found</h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                  We couldn't find any products matching your active filters. Try adjusting your search query, rating, or price ceiling.
                </p>
                <button
                  onClick={clearFilters}
                  id="no-results-clear-btn"
                  className="btn-primary py-2.5 px-6 text-xs sm:text-sm rounded-xl mt-2 shadow-2xs"
                >
                  Clear All Filters
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              <div>
                {/* Product Grid: 2 columns on mobile, 2 on tablet, 3 on desktop with sidebar */}
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6 items-stretch">
                  {filtered.map((p, i) => (
                    <ProductCard key={p.id} product={p} index={i} />
                  ))}
                </div>

                {/* Graceful sparse results banner if only 1-2 items show */}
                {filtered.length <= 2 && (
                  <div className="mt-8 p-6 bg-slate-100/80 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Explore more from THANGAM STORES</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Discover other curated essentials across all our categories.
                      </p>
                    </div>
                    <Link
                      to="/products"
                      onClick={clearFilters}
                      className="btn-secondary py-2.5 px-5 text-xs font-semibold rounded-xl shrink-0"
                    >
                      <span>View All Products</span>
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              /* List View Mode with full padding and aspect ratio */
              <div className="space-y-4">
                {filtered.map(p => (
                  <div
                    key={p.id}
                    className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6 shadow-2xs hover:border-slate-300 transition-colors"
                  >
                    <Link to={`/product/${p.id}`} className="shrink-0 aspect-[4/3] w-28 sm:w-32 bg-slate-100 rounded-xl overflow-hidden">
                      <img
                        src={p.images[0]}
                        alt={p.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </Link>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          {p.category}
                        </span>
                        {p.featured && (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            ★ Featured
                          </span>
                        )}
                      </div>

                      <Link to={`/product/${p.id}`} className="hover:text-emerald-700 transition-colors">
                        <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug">
                          {p.name}
                        </h3>
                      </Link>

                      <p className="text-xs sm:text-sm text-slate-500 line-clamp-2 leading-relaxed">
                        {p.description}
                      </p>

                      <div className="flex items-center gap-1.5 text-xs pt-1">
                        <div className="flex text-amber-400">
                          {[1, 2, 3, 4, 5].map(s => (
                            <Star
                              key={s}
                              size={12}
                              fill={s <= Math.round(p.rating) ? '#f59e0b' : 'none'}
                              stroke={s <= Math.round(p.rating) ? '#f59e0b' : '#cbd5e1'}
                            />
                          ))}
                        </div>
                        <span className="font-bold text-slate-800">{p.rating}</span>
                        <span className="text-slate-400">({p.reviewCount} reviews)</span>
                      </div>
                    </div>

                    <div className="sm:text-right shrink-0 flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-4 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <div>
                        <span className="text-xl font-extrabold text-slate-900">₹{p.price}</span>
                        {p.originalPrice && (
                          <span className="text-xs text-slate-400 line-through ml-2">₹{p.originalPrice}</span>
                        )}
                      </div>
                      <button
                        id={`list-add-to-cart-${p.id}`}
                        onClick={() => { addItem(p); openCart(); }}
                        disabled={p.stock === 0}
                        className="btn-primary py-2.5 px-5 text-xs font-semibold rounded-xl shadow-2xs"
                      >
                        {p.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}
