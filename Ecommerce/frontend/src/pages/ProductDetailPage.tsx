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
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { ProductCard } from '../components/ProductCard';
import clsx from 'clsx';
import { getActiveProducts } from '../services/productService';
import type { Product } from '../types';

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addItem, openCart } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getActiveProducts()
      .then(remoteProducts => {
        if (active) {
          setProducts(remoteProducts);
        }
      })
      .catch(error => {
        console.error('Failed to load Firestore products:', error);
      })
      .finally(() => {
        if (active) {
          setProductsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const product = useMemo(() => {
    return products.find(p => p.id === id);
  }, [products, id]);

  const [imgIdx, setImgIdx] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedColor, setColor] = useState(product?.colors?.[0]);
  const [selectedSize, setSize] = useState<string | undefined>();
  const [wished, setWished] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<'description' | 'specs' | 'reviews'>('description');

  useEffect(() => {
    setImgIdx(0);
    setImgError(false);
    setQuantity(1);
    setColor(product?.colors?.[0]);
    setSize(undefined);
  }, [product?.id]);

  if (!product && productsLoading) {
    return (
      <main className="min-h-screen bg-slate-50 pt-28 text-center px-4">
        <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-8 space-y-4 shadow-xs">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-900 font-bold text-lg">Loading Product...</p>
          <p className="text-slate-500 text-xs">Fetching the latest catalog details.</p>
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

  const related = products
    .filter(p => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const images = Array.isArray(product.images) && product.images.length > 0
    ? product.images
    : [];
  const currentImage = images[imgIdx] ?? images[0];

  const handleAddToCart = async () => {
    if (product.stock === 0 || adding) return;
    setAdding(true);
    addItem(product, quantity, selectedColor, selectedSize);
    await new Promise(r => setTimeout(r, 450));
    setAdding(false);
    openCart();
  };

  const handleBuyNow = () => {
    if (product.stock === 0) return;
    addItem(product, quantity, selectedColor, selectedSize);
    navigate('/checkout');
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 overflow-x-clip">
      <div className="page-container py-6 sm:py-8">

        {/* Clean Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-6">
          <Link to="/" className="hover:text-slate-900 transition-colors">Home</Link>
          <ChevronRight size={12} className="text-slate-400" />
          <Link to="/products" className="hover:text-slate-900 transition-colors">Products</Link>
          <ChevronRight size={12} className="text-slate-400" />
          <span className="capitalize text-slate-500">{product.category}</span>
          <ChevronRight size={12} className="text-slate-400" />
          <span className="font-semibold text-slate-900 truncate max-w-[200px]">{product.name}</span>
        </nav>

        {/* Product Detail Split Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-xs mb-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">

            {/* Left: Product Images Gallery */}
            <div className="lg:col-span-6 space-y-4">
              <div className="relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-200/80 aspect-square">
                {currentImage && !imgError ? (
                  <img
                    src={currentImage}
                    alt={product.name}
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-8 text-center">
                    <Package size={56} className="mb-2 text-slate-300" />
                    <span className="text-sm font-medium text-slate-600 line-clamp-2 max-w-xs">{product.name}</span>
                    <span className="text-xs text-slate-400 mt-1">No image available</span>
                  </div>
                )}

                {/* Badges */}
                <div className="absolute top-4 left-4 flex flex-col gap-1.5">
                  {product.discount && (
                    <span className="badge-clean bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold shadow-2xs">
                      -{product.discount}% OFF
                    </span>
                  )}
                  {product.featured && (
                    <span className="badge-clean bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold shadow-2xs">
                      ★ TOP SELLER
                    </span>
                  )}
                </div>

                <button
                  id="product-wishlist-btn"
                  onClick={() => setWished(v => !v)}
                  className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/95 border border-slate-200 shadow-2xs flex items-center justify-center text-slate-500 hover:text-rose-600 transition-colors"
                  aria-label="Save to Wishlist"
                >
                  <Heart size={16} fill={wished ? '#e11d48' : 'none'} stroke={wished ? '#e11d48' : 'currentColor'} />
                </button>
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="flex gap-2.5">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      id={`product-img-thumb-${i}`}
                      onClick={() => {
                        setImgIdx(i);
                        setImgError(false);
                      }}
                      className={clsx(
                        'w-16 h-16 rounded-xl overflow-hidden border-2 transition-all bg-slate-100',
                        imgIdx === i ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
                      )}
                    >
                      <img
                        src={img}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Product Details & Purchase Form */}
            <div className="lg:col-span-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
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

                {/* Rating */}
                <div className="flex items-center gap-2 mb-5">
                  <div className="flex text-amber-400">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star
                        key={s}
                        size={15}
                        fill={s <= Math.round(product.rating) ? '#f59e0b' : 'none'}
                        stroke={s <= Math.round(product.rating) ? '#f59e0b' : '#cbd5e1'}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-slate-800">{product.rating}</span>
                  <span className="text-xs text-slate-400">({product.reviewCount.toLocaleString()} reviews)</span>
                </div>

                {/* Price Display */}
                <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl flex items-baseline justify-between mb-6">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-display">
                      ${product.price}
                    </span>
                    {product.originalPrice && (
                      <span className="text-sm text-slate-400 line-through">
                        ${product.originalPrice}
                      </span>
                    )}
                  </div>
                  {product.originalPrice && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                      Save ${(product.originalPrice - product.price).toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Color Variants */}
                {product.colors && product.colors.length > 0 && (
                  <div className="mb-5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                      Color Selection
                    </label>
                    <div className="flex gap-2">
                      {product.colors.map(c => (
                        <button
                          key={c}
                          id={`color-swatch-${c}`}
                          onClick={() => setColor(c)}
                          className={clsx(
                            'w-7 h-7 rounded-full border-2 transition-all',
                            selectedColor === c ? 'ring-2 ring-blue-600 ring-offset-2 border-white' : 'border-slate-300 hover:border-slate-400'
                          )}
                          style={{ background: c }}
                          aria-label={`Color option ${c}`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Size Variants */}
                {product.sizes && product.sizes.length > 0 && (
                  <div className="mb-5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                      Size Selection
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {product.sizes.map(s => (
                        <button
                          key={s}
                          id={`size-btn-${s}`}
                          onClick={() => setSize(s)}
                          className={clsx(
                            'px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                            selectedSize === s
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quantity Controls */}
                <div className="flex items-center gap-4 mb-6">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Quantity:</span>
                  <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-0.5">
                    <button
                      id="qty-decrease-btn"
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="w-7 h-7 rounded-lg bg-white text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors shadow-2xs"
                      aria-label="Decrease quantity"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="w-8 text-center text-xs font-bold text-slate-900">{quantity}</span>
                    <button
                      id="qty-increase-btn"
                      onClick={() => setQuantity(q => Math.min(product.stock, q + 1))}
                      disabled={quantity >= product.stock}
                      className="w-7 h-7 rounded-lg bg-white text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors shadow-2xs disabled:opacity-40"
                      aria-label="Increase quantity"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  <span className="text-xs text-slate-400">
                    {product.stock > 0 ? `${product.stock} available in stock` : 'Out of stock'}
                  </span>
                </div>
              </div>

              {/* Conversion Buttons */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    id="product-add-to-cart-btn"
                    onClick={handleAddToCart}
                    disabled={adding || product.stock === 0}
                    className="btn-primary flex-1 py-3.5 rounded-xl text-sm justify-center"
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
                    className="btn-secondary flex-1 py-3.5 rounded-xl text-sm justify-center"
                  >
                    Buy Now Directly
                  </button>
                </div>

                {/* Trust mini-strip */}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  {[
                    { icon: Truck, label: 'Free Delivery', sub: 'Orders over $50' },
                    { icon: RotateCcw, label: '30-Day Return', sub: 'Hassle-free' },
                    { icon: Shield, label: '2-Yr Warranty', sub: 'Official cover' },
                  ].map(({ icon: Icon, label, sub }, i) => (
                    <div key={i} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                      <Icon size={15} className="text-blue-600 mx-auto mb-1" />
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
                  'px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all',
                  tab === t
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Tab Content */}
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

          {tab === 'specs' && (
            <div className="max-w-2xl">
              <table className="w-full text-xs sm:text-sm">
                <tbody className="divide-y divide-slate-100">
                  {[
                    ['Category', product.category],
                    ['Product ID', product.id.toUpperCase()],
                    ['Inventory', `${product.stock} units available`],
                    ['Rating', `${product.rating} / 5.0`],
                    ['Reviews', `${product.reviewCount.toLocaleString()} verified ratings`],
                    ['Colors', product.colors?.join(', ') ?? 'Single colorway'],
                    ['Sizes', product.sizes?.join(', ') ?? 'Standard size'],
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

          {tab === 'reviews' && (
            <div className="space-y-4 max-w-3xl">
              {[
                { name: 'Sarah Jenkins', rating: 5, comment: 'Exceeded all expectations. Build quality is top-notch and arrived in two days.' },
                { name: 'Alex Rivera', rating: 5, comment: 'Clean minimal design. Exactly as described in the specifications sheet.' },
                { name: 'David Cho', rating: 4, comment: 'Very happy with the purchase. Customer support was swift and helpful.' },
              ].map((rev, i) => (
                <div key={i} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{rev.name}</span>
                    <div className="flex text-amber-400">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} size={11} fill={s <= rev.rating ? '#f59e0b' : 'none'} stroke={s <= rev.rating ? '#f59e0b' : '#cbd5e1'} />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{rev.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Related Products */}
        {related.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-end justify-between">
              <div>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Recommendations</span>
                <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">
                  Related Products
                </h2>
              </div>
              <Link to={`/products?category=${product.category}`} className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
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
        <div className="mt-10">
          <button
            onClick={() => navigate(-1)}
            id="product-back-btn"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={14} /> Back to Catalog
          </button>
        </div>

      </div>
    </main>
  );
}
