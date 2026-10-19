import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import {
  ArrowLeft,
  Star,
  ShoppingBag,
  Heart,
  Shield,
  Truck,
  RotateCcw,
  Minus,
  Plus,
  ChevronRight,
  Check,
  Package,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { ProductCard } from '../components/ProductCard';
import clsx from 'clsx';
import { getActiveProducts, getActiveProductById } from '../services/productService';
import type { Product } from '../types';

interface ReviewItem {
  id: string;
  name: string;
  rating: number;
  comment: string;
  date: string;
  verified?: boolean;
}

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addItem, openCart } = useCart();
  const { isFavorite, toggleFavorite } = useWishlist();
  const { user } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [directProduct, setDirectProduct] = useState<Product | null>(null);
  const [directLoading, setDirectLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getActiveProducts()
      .then(remoteProducts => {
        if (active) setProducts(remoteProducts);
      })
      .catch(error => console.error('Failed to load products:', error))
      .finally(() => { if (active) setProductsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!id) {
      setDirectLoading(false);
      return;
    }
    setDirectLoading(true);
    getActiveProductById(id)
      .then(p => {
        if (active && p) setDirectProduct(p);
      })
      .catch(console.error)
      .finally(() => { if (active) setDirectLoading(false); });

    return () => { active = false; };
  }, [id]);

  const product = useMemo(() => {
    if (!id) return undefined;
    return (
      products.find(
        p => p.id === id || p.id.toLowerCase() === id.toLowerCase() || (p as any).slug === id
      ) || directProduct || undefined
    );
  }, [products, id, directProduct]);

  const [imgIdx, setImgIdx] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedColor, setColor] = useState(product?.colors?.[0]);
  const [selectedSize, setSize] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<'description' | 'specs' | 'reviews'>('description');

  // Review submission state
  const [userRating, setUserRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewerName, setReviewerName] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  // Reviews state with persistence
  const [reviews, setReviews] = useState<ReviewItem[]>([]);

  useEffect(() => {
    setImgIdx(0);
    setImgError(false);
    setQuantity(1);
    setColor(product?.colors?.[0]);
    setSize(undefined);
    setReviewSubmitted(false);

    if (user?.name) {
      setReviewerName(user.name);
    }

    if (product) {
      const storageKey = `ems_reviews_${product.id}`;
      const defaultReviews: ReviewItem[] = [
        {
          id: '1',
          name: 'Dr. Ramesh Sharma',
          rating: 5,
          comment: 'Authentic formulation with remarkable purity. My patients report consistent and gentle benefits without gastric irritation.',
          date: '1 week ago',
          verified: true,
        },
        {
          id: '2',
          name: 'Priya Sundaram',
          rating: 5,
          comment: 'The quality of this remedy is genuinely dispensary grade. Fresh aroma and packaged cleanly. Collected from the counter smoothly.',
          date: '2 weeks ago',
          verified: true,
        },
        {
          id: '3',
          name: 'Anand K.',
          rating: 4,
          comment: 'Noticeable vitality improvement after 10 days of regular use. Will be reordering another batch.',
          date: '1 month ago',
          verified: true,
        },
      ];

      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          setReviews([...JSON.parse(saved), ...defaultReviews]);
        } else {
          setReviews(defaultReviews);
        }
      } catch {
        setReviews(defaultReviews);
      }
    }
  }, [product?.id, user?.name]);

  if (!product && (productsLoading || directLoading)) {
    return (
      <main className="min-h-screen bg-slate-50 pt-28 text-center px-4">
        <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-8 space-y-4 shadow-xs">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-900 font-bold text-lg">Loading Product...</p>
          <p className="text-slate-500 text-xs">Fetching dispensary catalog details.</p>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="min-h-screen bg-slate-50 pt-28 text-center px-4">
        <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-8 space-y-4 shadow-xs">
          <p className="text-slate-900 font-bold text-lg">Product Not Found</p>
          <p className="text-slate-500 text-xs">The requested product could not be located in our catalog.</p>
          <Link to="/products" className="btn-primary py-2 px-4 text-xs rounded-xl inline-flex">
            Return to Products
          </Link>
        </div>
      </main>
    );
  }

  const handleAddToCart = async () => {
    if (product.stock === 0 || adding) return;
    setAdding(true);
    addItem(product, quantity, selectedColor, selectedSize);
    await new Promise(r => setTimeout(r, 350));
    setAdding(false);
    openCart();
  };

  const handleBuyNow = () => {
    if (product.stock === 0) return;
    addItem(product, quantity, selectedColor, selectedSize);
    navigate('/checkout');
  };

  const handleAddReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewComment.trim()) return;

    const newReview: ReviewItem = {
      id: `rev_${Date.now()}`,
      name: reviewerName.trim() || user?.name || 'Verified Customer',
      rating: userRating,
      comment: reviewComment.trim(),
      date: 'Just now',
      verified: true,
    };

    const nextReviews = [newReview, ...reviews];
    setReviews(nextReviews);
    try {
      const storageKey = `ems_reviews_${product.id}`;
      const userAdded = nextReviews.filter(r => r.id.startsWith('rev_'));
      localStorage.setItem(storageKey, JSON.stringify(userAdded));
    } catch {
      // ignore
    }

    setReviewComment('');
    setReviewSubmitted(true);
    setTimeout(() => setReviewSubmitted(false), 5000);
  };

  const related = products
    .filter(p => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const activeImg = product.images[imgIdx] ?? product.images[0];
  const wished = isFavorite(product.id);

  // Compute average rating from reviews
  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : product.rating.toFixed(1);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pt-6 pb-20 md:pb-12">
      <div className="page-container">

        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-6 flex-wrap">
          <Link to="/" className="hover:text-emerald-700 transition-colors">Home</Link>
          <ChevronRight size={13} className="text-slate-400" />
          <Link to="/products" className="hover:text-emerald-700 transition-colors">Products</Link>
          <ChevronRight size={13} className="text-slate-400" />
          <span className="text-slate-800 font-semibold truncate max-w-xs">{product.name}</span>
        </nav>

        {/* Product Hero Layout */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-8 shadow-xs mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">

            {/* Left: Image Gallery */}
            <div className="lg:col-span-6 flex flex-col gap-4">
              <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-slate-100 border border-slate-200/80">
                {imgError || !activeImg ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                    <Package size={48} className="text-slate-300 mb-2" />
                    <span className="text-xs font-medium text-slate-500">{product.name}</span>
                  </div>
                ) : (
                  <img
                    src={activeImg}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    onError={() => setImgError(true)}
                  />
                )}

                {/* Badges */}
                <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
                  {product.discount && (
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                      -{product.discount}% OFF
                    </span>
                  )}
                  {product.stock > 0 && product.stock <= 5 && (
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                      Only {product.stock} left
                    </span>
                  )}
                </div>
              </div>

              {/* Thumbnails */}
              {product.images.length > 1 && (
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {product.images.map((img, i) => (
                    <button
                      key={i}
                      id={`product-img-thumb-${i}`}
                      onClick={() => {
                        setImgIdx(i);
                        setImgError(false);
                      }}
                      className={clsx(
                        'w-16 h-16 rounded-xl overflow-hidden border-2 transition-all bg-slate-100 shrink-0 cursor-pointer',
                        imgIdx === i ? 'border-emerald-600 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300'
                      )}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Product Details & Purchase Form */}
            <div className="lg:col-span-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                    {product.category}
                  </span>
                  {product.stock <= 5 && product.stock > 0 && (
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Low Stock: {product.stock} items remaining
                    </span>
                  )}
                </div>

                <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 mb-3 tracking-tight">
                  {product.name}
                </h1>

                {/* Rating Banner */}
                <div className="flex items-center gap-2 mb-5">
                  <div className="flex text-amber-400">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star
                        key={s}
                        size={16}
                        fill={s <= Math.round(Number(avgRating)) ? '#f59e0b' : 'none'}
                        stroke={s <= Math.round(Number(avgRating)) ? '#f59e0b' : '#cbd5e1'}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-slate-800">{avgRating} / 5.0</span>
                  <button
                    type="button"
                    onClick={() => setTab('reviews')}
                    className="text-xs text-emerald-700 hover:underline font-medium"
                  >
                    ({reviews.length} ratings &amp; reviews)
                  </button>
                </div>

                {/* Price Display */}
                <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl flex items-baseline justify-between mb-6">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-display">
                      ₹{product.price}
                    </span>
                    {product.originalPrice && (
                      <span className="text-sm text-slate-400 line-through">
                        ₹{product.originalPrice}
                      </span>
                    )}
                  </div>
                  {product.originalPrice && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                      Save ₹{product.originalPrice - product.price}
                    </span>
                  )}
                </div>

                {/* Description snippet */}
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-6">
                  {product.description}
                </p>

                {/* Quantity selector */}
                <div className="mb-6">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                    Quantity
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center border border-slate-200 rounded-xl bg-white shadow-2xs">
                      <button
                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        disabled={quantity <= 1 || product.stock === 0}
                        className="p-2 text-slate-500 hover:text-slate-900 disabled:opacity-40"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={15} />
                      </button>
                      <span className="px-4 text-xs font-bold text-slate-900">{quantity}</span>
                      <button
                        onClick={() => setQuantity(q => Math.min(product.stock, q + 1))}
                        disabled={quantity >= product.stock || product.stock === 0}
                        className="p-2 text-slate-500 hover:text-slate-900 disabled:opacity-40"
                        aria-label="Increase quantity"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                    <span className="text-xs text-slate-400">
                      {product.stock > 0 ? `${product.stock} units available` : 'Out of stock'}
                    </span>
                  </div>
                </div>

              </div>

              {/* Action Buttons */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    id="product-add-to-cart-btn"
                    onClick={handleAddToCart}
                    disabled={adding || product.stock === 0}
                    className="btn-primary flex-1 py-3.5 rounded-xl text-sm justify-center cursor-pointer"
                  >
                    {adding ? (
                      <>
                        <Check size={16} />
                        <span>Added to Cart!</span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag size={16} />
                        <span>Add to Cart</span>
                      </>
                    )}
                  </button>

                  <button
                    id="product-buy-now-btn"
                    onClick={handleBuyNow}
                    disabled={product.stock === 0}
                    className="btn-secondary flex-1 py-3.5 rounded-xl text-sm justify-center cursor-pointer"
                  >
                    Buy Now Directly
                  </button>

                  {/* Wishlist toggle */}
                  <button
                    id="product-wishlist-toggle-btn"
                    onClick={() => toggleFavorite(product.id)}
                    className="p-3.5 rounded-xl border border-slate-200 hover:border-rose-300 hover:bg-rose-50/50 text-slate-500 hover:text-rose-600 transition-colors flex items-center justify-center shrink-0 cursor-pointer shadow-2xs"
                    aria-label={wished ? 'Remove from favorites' : 'Add to favorites'}
                    title={wished ? 'Saved in favorites' : 'Save to favorites'}
                  >
                    <Heart size={18} fill={wished ? '#e11d48' : 'none'} stroke={wished ? '#e11d48' : 'currentColor'} />
                  </button>
                </div>

                {/* Trust mini-strip */}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  {[
                    { icon: Truck, label: 'Dispensary Pickup', sub: 'Collect in 2-4 hrs' },
                    { icon: RotateCcw, label: 'Authentic Herbs', sub: '100% verified' },
                    { icon: Shield, label: 'Standardized', sub: 'Lab certified' },
                  ].map(({ icon: Icon, label, sub }, i) => (
                    <div key={i} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                      <Icon size={15} className="text-emerald-700 mx-auto mb-1" />
                      <p className="text-[11px] font-bold text-slate-800">{label}</p>
                      <p className="text-[10px] text-slate-400">{sub}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* Tabbed Specs, Description, and Reviews */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs mb-12">
          {/* Tabs Navigation */}
          <div className="flex gap-2 border-b border-slate-100 pb-3 mb-6">
            {(['description', 'specs', 'reviews'] as const).map(t => (
              <button
                key={t}
                id={`tab-${t}`}
                onClick={() => setTab(t)}
                className={clsx(
                  'px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer',
                  tab === t
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                )}
              >
                {t === 'reviews' ? `Ratings & Reviews (${reviews.length})` : t}
              </button>
            ))}
          </div>

          {/* Tab: Description */}
          {tab === 'description' && (
            <div className="space-y-4 max-w-3xl">
              <p className="text-slate-700 text-sm leading-relaxed">{product.description}</p>
              <div className="flex flex-wrap gap-2 pt-3">
                {product.tags.map(tag => (
                  <span key={tag} className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs rounded-lg font-medium">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tab: Specs */}
          {tab === 'specs' && (
            <div className="max-w-2xl">
              <table className="w-full text-xs sm:text-sm">
                <tbody className="divide-y divide-slate-100">
                  {[
                    ['Category', product.category],
                    ['Product ID', product.id.toUpperCase()],
                    ['Inventory', `${product.stock} units available in dispensary`],
                    ['Rating', `${avgRating} / 5.0`],
                    ['Reviews', `${reviews.length} verified ratings`],
                    ['Form', 'Classical Ayurvedic / Herbal Preparation'],
                    ['Preservation', 'Store in cool, dry place away from sunlight'],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td className="py-2.5 pr-4 font-semibold text-slate-500 w-36">{k}</td>
                      <td className="py-2.5 text-slate-900 capitalize font-medium">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab: Reviews & Star Ratings */}
          {tab === 'reviews' && (
            <div className="space-y-8 max-w-3xl">

              {/* Rating Summary Header */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-6">
                <div className="text-center sm:text-left shrink-0">
                  <div className="font-display font-extrabold text-4xl text-slate-900">{avgRating}</div>
                  <div className="flex text-amber-400 my-1 justify-center sm:justify-start">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} size={15} fill={s <= Math.round(Number(avgRating)) ? '#f59e0b' : 'none'} stroke={s <= Math.round(Number(avgRating)) ? '#f59e0b' : '#cbd5e1'} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Based on {reviews.length} reviews</p>
                </div>

                <div className="flex-1 w-full space-y-1.5 text-xs text-slate-600">
                  {[5, 4, 3, 2, 1].map(stars => {
                    const count = reviews.filter(r => r.rating === stars).length;
                    const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                    return (
                      <div key={stars} className="flex items-center gap-2">
                        <span className="w-8 text-right font-medium">{stars} ★</span>
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-slate-400 text-[11px]">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Write a Review Section */}
              <div className="bg-white border border-emerald-100 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
                <h4 className="font-display font-bold text-sm text-slate-900">
                  Write a Product Review &amp; Rating
                </h4>

                {reviewSubmitted && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>Thank you for sharing your experience! Your review is recorded.</span>
                  </div>
                )}

                <form onSubmit={handleAddReview} className="space-y-3.5">
                  {/* Interactive Star Rating Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Your Rating: <span className="font-bold text-amber-600">{hoverRating || userRating} / 5 Stars</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setUserRating(star)}
                          className="p-1 text-amber-400 hover:scale-115 transition-transform cursor-pointer focus:outline-none"
                          aria-label={`Rate ${star} stars`}
                        >
                          <Star
                            size={22}
                            fill={(hoverRating || userRating) >= star ? '#f59e0b' : 'none'}
                            stroke={(hoverRating || userRating) >= star ? '#f59e0b' : '#cbd5e1'}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reviewer Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Your Name
                    </label>
                    <input
                      type="text"
                      value={reviewerName}
                      onChange={e => setReviewerName(e.target.value)}
                      placeholder="e.g. Ramesh S."
                      className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>

                  {/* Review Comment */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Review &amp; Feedback
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={reviewComment}
                      onChange={e => setReviewComment(e.target.value)}
                      placeholder="Share your experience regarding herbal quality, benefits, packaging, or dispensary pickup..."
                      className="w-full p-3 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                  >
                    <Send size={13} />
                    <span>Submit Review</span>
                  </button>
                </form>
              </div>

              {/* Reviews List */}
              <div className="space-y-3 pt-2">
                <h4 className="font-display font-bold text-sm text-slate-900">
                  Patient &amp; Customer Reviews ({reviews.length})
                </h4>

                {reviews.map((rev) => (
                  <div key={rev.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{rev.name}</span>
                        {rev.verified && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                            Verified Pickup
                          </span>
                        )}
                      </div>
                      <div className="flex text-amber-400">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} size={11} fill={s <= rev.rating ? '#f59e0b' : 'none'} stroke={s <= rev.rating ? '#f59e0b' : '#cbd5e1'} />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{rev.comment}</p>
                    <span className="text-[10px] text-slate-400 block">{rev.date}</span>
                  </div>
                ))}
              </div>

            </div>
          )}
        </div>

        {/* Related Products */}
        {related.length > 0 && (
          <div className="space-y-6 mb-12">
            <div className="flex items-end justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Recommendations</span>
                <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">
                  Related Formulations
                </h2>
              </div>
              <Link to={`/products?category=${product.category}`} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
                View Category <ChevronRight size={13} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {related.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Back Link */}
        <div className="mt-8">
          <button
            onClick={() => navigate(-1)}
            id="product-back-btn"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} /> Back to Catalog
          </button>
        </div>

      </div>
    </main>
  );
}
