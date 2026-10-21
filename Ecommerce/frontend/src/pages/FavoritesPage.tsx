import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart,
  ShoppingBag,
  ArrowRight,
  Trash2,
  Package,
  Star,
  Check,
  ShieldCheck,
  LogIn,
  Leaf,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import { useCart } from '../context/CartContext';
import { getActiveProducts } from '../services/productService';
import type { Product } from '../types';

export function FavoritesPage() {
  const { user, isAuthenticated, isLoading: authLoading, signInWithGoogle } = useAuth();
  const { favorites, toggleFavorite, clearFavorites, purgeStaleFavorites } = useWishlist();
  const { addItem, openCart } = useCart();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});

  // Fetch active catalog from Firestore, then purge stale favorite IDs
  useEffect(() => {
    let active = true;
    getActiveProducts()
      .then(prods => {
        if (active) {
          setProducts(prods);
          // Remove any saved favorite IDs that no longer exist in the catalog
          purgeStaleFavorites(prods.map(p => p.id));
        }
      })
      .catch(console.warn)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const favoriteProducts = useMemo(() => {
    return products.filter(p => favorites.includes(p.id));
  }, [products, favorites]);

  const handleAddToCart = async (product: Product, e: React.MouseEvent) => {
    e.preventDefault();
    if (product.stock === 0) return;
    addItem(product);
    setAddedIds(prev => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setAddedIds(prev => ({ ...prev, [product.id]: false }));
    }, 1200);
    openCart();
  };

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Sign-in error:', err);
    } finally {
      setSigningIn(false);
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-emerald-700" />
          <p className="text-xs font-semibold text-slate-500">Checking authorization...</p>
        </div>
      </main>
    );
  }

  // ── 1. UNAUTHENTICATED STATE — ACCESS RESTRICTED ONLY TO LOGGED-IN USERS ──
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 overflow-x-clip">
        <div className="page-container py-12 sm:py-20 max-w-xl mx-auto">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-xs text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto">
              <Heart size={32} />
            </div>

            <div>
              <span className="badge-clean bg-rose-100 text-rose-800 text-xs font-bold border border-rose-200">
                Registered Customers Only
              </span>
              <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900 tracking-tight mt-2">
                My Saved Favourites
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                Your favourites list is saved securely to your dispensary account so you can reorder your preferred Ayurvedic formulations and natural health remedies anytime from any device.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 text-left space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-800">
                <ShieldCheck size={14} className="text-emerald-600" />
                Dispensary Account Perks
              </div>
              <p>• Permanent cloud sync of remedies across browser reloads &amp; window closures</p>
              <p>• 1-click add to cart for rapid in-store Click &amp; Collect orders</p>
              <p>• Real-time stock status &amp; preparation alerts for saved items</p>
            </div>

            <div className="pt-2 flex flex-col gap-3">
              <button
                onClick={handleGoogleSignIn}
                disabled={signingIn}
                className="w-full h-11 px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-semibold text-sm transition-colors shadow-2xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {signingIn ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <LogIn size={16} />
                    <span>Sign In to Access Favourites</span>
                  </>
                )}
              </button>

              <Link
                to="/products"
                className="w-full h-11 px-6 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                <Leaf size={15} />
                <span>Browse Dispensary Catalog</span>
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── 2. AUTHENTICATED USER STATE ──
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 overflow-x-clip">
      <div className="page-container py-8 sm:py-12">

        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-xs text-slate-500 mb-6" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-emerald-700 transition-colors">Home</Link>
          <span>/</span>
          <span className="text-slate-900 font-semibold">My Favourites</span>
        </nav>

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="badge-clean bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200 flex items-center gap-1.5">
                <Heart size={12} className="fill-rose-600 text-rose-600" />
                Customer Wishlist
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs font-semibold text-slate-600">{user?.name}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900 tracking-tight">
              Saved Herbal Remedies
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Your personal herbal remedy formulations saved for quick pickup at the dispensary.
            </p>
          </div>

          {favoriteProducts.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={clearFavorites}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Clear All</span>
              </button>
              <Link
                to="/products"
                className="btn-primary py-2 px-4 text-xs rounded-xl inline-flex items-center gap-1.5 shadow-2xs"
              >
                <span>Add More</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="py-20 text-center text-sm text-slate-500 flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-emerald-700" />
            <p>Loading your saved remedies from THANGAM STORES database...</p>
          </div>
        ) : favoriteProducts.length === 0 ? (
          /* Empty State */
          <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-12 text-center max-w-lg mx-auto shadow-xs space-y-5 my-8">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-500 mx-auto">
              <Heart size={30} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Your Favourites list is empty</h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed">
                You haven't saved any remedies yet. Tap the heart icon on any product in the catalog to add it to your favourites.
              </p>
            </div>
            <Link
              to="/products"
              className="btn-primary py-3 px-6 text-xs sm:text-sm rounded-xl inline-flex items-center gap-2 shadow-2xs"
            >
              <Leaf size={15} />
              <span>Explore Products</span>
            </Link>
          </div>
        ) : (
          /* Products Grid: 2 columns on mobile, 3 on tablet, 4 on desktop */
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 border-b border-slate-200 pb-3">
              <span>Showing {favoriteProducts.length} saved {favoriteProducts.length === 1 ? 'remedy' : 'remedies'}</span>
              <span className="text-emerald-700">Store Stock Live</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
              {favoriteProducts.map(product => {
                const isOutOfStock = product.stock === 0;
                const isAdded = addedIds[product.id];
                const activeImg = product.images[0];

                return (
                  <div
                    key={product.id}
                    className="group bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-slate-300 hover:shadow-md transition-all duration-200 flex flex-col h-full"
                  >
                    {/* Image */}
                    <div className="relative aspect-[4/3] w-full bg-slate-50 overflow-hidden flex items-center justify-center p-2.5">
                      <Link to={`/product/${product.id}`} className="block w-full h-full flex items-center justify-center">
                        <img
                          src={activeImg}
                          alt={product.name}
                          width={600}
                          height={450}
                          loading="lazy"
                          className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
                        />
                      </Link>

                      {/* Remove from Favorites Button */}
                      <button
                        onClick={() => toggleFavorite(product.id)}
                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-xs border border-rose-200 text-rose-600 flex items-center justify-center hover:bg-rose-50 transition-colors shadow-2xs z-10"
                        title="Remove from favourites"
                        aria-label={`Remove ${product.name} from favourites`}
                      >
                        <Heart size={15} className="fill-rose-600 text-rose-600" />
                      </button>

                      {product.discount && (
                        <span className="absolute top-3 left-3 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs pointer-events-none">
                          -{product.discount}%
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block mb-1">
                          {product.category}
                        </span>
                        <Link to={`/product/${product.id}`}>
                          <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors line-clamp-2">
                            {product.name}
                          </h3>
                        </Link>

                        {/* Rating */}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <div className="flex text-amber-400">
                            {[1, 2, 3, 4, 5].map(s => (
                              <Star
                                key={s}
                                size={11}
                                fill={s <= Math.round(product.rating) ? '#f59e0b' : 'none'}
                                stroke={s <= Math.round(product.rating) ? '#f59e0b' : '#cbd5e1'}
                              />
                            ))}
                          </div>
                          <span className="text-xs font-semibold text-slate-700">{product.rating}</span>
                          <span className="text-[11px] text-slate-400">({product.reviewCount})</span>
                        </div>
                      </div>

                      {/* Price & Add to Cart */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                        <div>
                          <span className="text-base font-extrabold text-slate-900">₹{product.price}</span>
                          {product.originalPrice && (
                            <span className="text-xs text-slate-400 line-through ml-1.5">
                              ₹{product.originalPrice}
                            </span>
                          )}
                        </div>

                        <button
                          onClick={e => handleAddToCart(product, e)}
                          disabled={isOutOfStock || isAdded}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer ${
                            isOutOfStock
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : isAdded
                              ? 'bg-emerald-600 text-white'
                              : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                          }`}
                        >
                          {isOutOfStock ? (
                            'Sold Out'
                          ) : isAdded ? (
                            <>
                              <Check size={13} strokeWidth={2.5} />
                              <span>Added</span>
                            </>
                          ) : (
                            <>
                              <ShoppingBag size={13} />
                              <span>Add</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
