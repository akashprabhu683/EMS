import { Link } from 'react-router-dom';
import { ShoppingBag, Heart, Star, Check, AlertCircle, Package } from 'lucide-react';
import { useCart } from '../context/CartContext';
import type { Product } from '../types';
import { useState } from 'react';

interface ProductCardProps {
  product: Product;
  index?: number;
}

export function ProductCard({ product }: ProductCardProps) {
  const { addItem, openCart } = useCart();
  const [wished, setWished]     = useState(false);
  const [adding, setAdding]     = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (product.stock === 0 || adding) return;
    setAdding(true);
    addItem(product);
    await new Promise(r => setTimeout(r, 400));
    setAdding(false);
    openCart();
  };

  const isOutOfStock = product.stock === 0;
  const activeImg = product.images[imgIdx] ?? product.images[0];
  const isImageBroken = imgErrors[imgIdx] || !activeImg;

  return (
    <div
      id={`product-card-${product.id}`}
      className="product-card group flex flex-col bg-white border border-slate-200/90 rounded-2xl overflow-hidden hover:border-slate-300 hover:shadow-md transition-all duration-200"
    >
      {/* Image area — strict aspect-ratio 4:3 with fallback */}
      <div className="product-card__image relative aspect-[4/3] w-full bg-slate-100 overflow-hidden flex-shrink-0">
        <Link
          to={`/product/${product.id}`}
          id={`product-card-link-${product.id}`}
          className="block w-full h-full"
          tabIndex={-1}
          onMouseEnter={() => {
            if (product.images.length > 1 && !imgErrors[1]) {
              setImgIdx(1);
            }
          }}
          onMouseLeave={() => {
            setImgIdx(0);
          }}
        >
          {isImageBroken ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-4 text-center">
              <Package size={32} className="mb-1 text-slate-300" />
              <span className="text-[11px] font-medium text-slate-500 line-clamp-1">{product.name}</span>
            </div>
          ) : (
            <img
              src={activeImg}
              alt={product.name}
              width={600}
              height={450}
              loading="lazy"
              onError={() => {
                setImgErrors(prev => ({ ...prev, [imgIdx]: true }));
                if (imgIdx !== 0) {
                  setImgIdx(0);
                }
              }}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          )}
        </Link>

        {/* Badges — offset nicely from corners */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none z-10">
          {product.discount && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/90 shadow-2xs">
              -{product.discount}%
            </span>
          )}
          {product.isNew && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/90 shadow-2xs">
              NEW
            </span>
          )}
          {product.featured && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200/90 shadow-2xs">
              ★ TOP PICK
            </span>
          )}
        </div>

        {/* Wishlist button */}
        <button
          id={`wishlist-btn-${product.id}`}
          onClick={(e) => { e.preventDefault(); setWished(v => !v); }}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/95 border border-slate-200 shadow-2xs flex items-center justify-center text-slate-500 hover:text-rose-600 hover:border-rose-200 transition-colors z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
        >
          <Heart size={14} fill={wished ? '#e11d48' : 'none'} stroke={wished ? '#e11d48' : 'currentColor'} />
        </button>
      </div>

      {/* Card body — flex-1 to fill space evenly */}
      <div className="product-card__body flex flex-col flex-1 p-4 sm:p-5 gap-2">
        {/* Category & Stock Warning */}
        <div className="flex items-center justify-between text-xs gap-2">
          <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-500 truncate">
            {product.category}
          </span>
          {product.stock <= 5 && product.stock > 0 && (
            <span className="text-amber-600 font-medium flex items-center gap-1 text-[11px] shrink-0">
              <AlertCircle size={11} /> {product.stock} left
            </span>
          )}
        </div>

        {/* Product Title */}
        <Link to={`/product/${product.id}`} className="group-hover:text-blue-600 transition-colors">
          <h3 className="text-slate-900 text-sm sm:text-base font-semibold leading-snug line-clamp-2">
            {product.name}
          </h3>
        </Link>

        {/* Rating */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className="flex text-amber-400 shrink-0">
            {[1, 2, 3, 4, 5].map(s => (
              <Star
                key={s}
                size={12}
                fill={s <= Math.round(product.rating) ? '#f59e0b' : 'none'}
                stroke={s <= Math.round(product.rating) ? '#f59e0b' : '#cbd5e1'}
              />
            ))}
          </div>
          <span className="text-xs font-semibold text-slate-700">{product.rating}</span>
          <span className="text-xs text-slate-400">({product.reviewCount})</span>
        </div>

        {/* Actions row: Price + Add Button */}
        <div className="product-card__actions mt-auto pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">${product.price}</span>
            {product.originalPrice && (
              <span className="text-xs text-slate-400 line-through">${product.originalPrice}</span>
            )}
          </div>

          <button
            id={`add-to-cart-btn-${product.id}`}
            onClick={handleAddToCart}
            disabled={adding || isOutOfStock}
            className={`px-3.5 py-2 min-h-[36px] min-w-[76px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 shrink-0 ${
              isOutOfStock
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : adding
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-2xs hover:shadow-xs'
            }`}
            aria-label={isOutOfStock ? `${product.name} is sold out` : `Add ${product.name} to cart`}
          >
            {isOutOfStock ? (
              'Sold Out'
            ) : adding ? (
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
}
