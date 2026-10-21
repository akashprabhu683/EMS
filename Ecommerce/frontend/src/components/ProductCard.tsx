import { Link } from 'react-router-dom';
import { ShoppingBag, Heart, Star, Check, AlertCircle, Package } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import type { Product } from '../types';
import { useState } from 'react';

interface ProductCardProps {
  product: Product;
  index?: number;
}

export function ProductCard({ product }: ProductCardProps) {
  const { addItem, openCart } = useCart();
  const { isFavorite, toggleFavorite } = useWishlist();
  const wished = isFavorite(product.id);
  const [adding, setAdding] = useState(false);
  // Always show the first image — determined by the product's stable ID in Firestore.
  // No random index, no hover-swap; images[0] is the canonical primary image.
  const [imgError, setImgError] = useState(false);

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
  // Primary image is always index 0 — stable, deterministic, matched to product ID
  const primaryImg = product.images[0] ?? '';
  const isImageBroken = imgError || !primaryImg;

  return (
    <div
      id={`product-card-${product.id}`}
      className="product-card group flex flex-col h-full bg-white border border-slate-200/90 rounded-2xl overflow-hidden hover:border-slate-300 hover:shadow-md transition-all duration-200"
    >
      {/* Image area — strict aspect-ratio 4:3 with contain fit to avoid cropping packaging */}
      <div className="product-card__image relative aspect-[4/3] w-full bg-slate-50 overflow-hidden flex-shrink-0 flex items-center justify-center p-2.5">
        <Link
          to={`/product/${product.id}`}
          id={`product-card-link-${product.id}`}
          className="block w-full h-full flex items-center justify-center"
          tabIndex={-1}
        >
          {isImageBroken ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-2 text-center">
              <Package size={28} className="mb-1 text-slate-300" />
              <span className="text-[10px] font-medium text-slate-500 line-clamp-1">{product.name}</span>
            </div>
          ) : (
            <img
              key={`${product.id}-img`}
              src={primaryImg}
              alt={product.name}
              width={600}
              height={450}
              loading="lazy"
              onError={() => setImgError(true)}
              className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
            />
          )}
        </Link>

        {/* Badges — offset nicely from corners */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none z-10">
          {product.discount && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
              -{product.discount}%
            </span>
          )}
          {product.isNew && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs">
              NEW
            </span>
          )}
          {product.featured && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
              ★ TOP
            </span>
          )}
        </div>

        {/* Wishlist button */}
        <button
          id={`wishlist-btn-${product.id}`}
          onClick={(e) => { e.preventDefault(); toggleFavorite(product.id); }}
          className="absolute top-2 right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/95 border border-slate-200 shadow-2xs flex items-center justify-center text-slate-500 hover:text-rose-600 hover:border-rose-200 transition-colors z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
          aria-label={wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
        >
          <Heart size={13} fill={wished ? '#e11d48' : 'none'} stroke={wished ? '#e11d48' : 'currentColor'} />
        </button>
      </div>

      {/* Card body — flex-1 to fill space evenly */}
      <div className="product-card__body flex flex-col flex-1 p-3 sm:p-4 gap-1.5 sm:gap-2">
        {/* Category & Stock Warning */}
        <div className="flex items-center justify-between text-xs gap-1.5">
          <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400 truncate">
            {product.category}
          </span>
          {product.stock <= 5 && product.stock > 0 && (
            <span className="text-amber-600 font-medium flex items-center gap-0.5 text-[10px] shrink-0">
              <AlertCircle size={10} /> {product.stock} left
            </span>
          )}
        </div>

        {/* Product Title */}
        <Link to={`/product/${product.id}`} className="group-hover:text-emerald-700 transition-colors">
          <h3 className="text-slate-900 text-xs sm:text-sm font-semibold leading-snug line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem]">
            {product.name}
          </h3>
        </Link>

        {/* Rating */}
        <div className="flex items-center gap-1 mt-0.5">
          <div className="flex text-amber-400 shrink-0">
            {[1, 2, 3, 4, 5].map(s => (
              <Star
                key={s}
                size={11}
                fill={s <= Math.round(product.rating) ? '#f59e0b' : 'none'}
                stroke={s <= Math.round(product.rating) ? '#f59e0b' : '#cbd5e1'}
              />
            ))}
          </div>
          <span className="text-[11px] font-semibold text-slate-700">{product.rating}</span>
          <span className="text-[10px] text-slate-400">({product.reviewCount})</span>
        </div>

        {/* Actions row: Price + Add Button */}
        <div className="product-card__actions mt-auto pt-2.5 sm:pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-1 min-w-0">
            <span className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">₹{product.price}</span>
            {product.originalPrice && (
              <span className="text-[10px] sm:text-xs text-slate-400 line-through">₹{product.originalPrice}</span>
            )}
          </div>

          <button
            id={`add-to-cart-btn-${product.id}`}
            onClick={handleAddToCart}
            disabled={adding || isOutOfStock}
            className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 min-h-[30px] sm:min-h-[34px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shrink-0 cursor-pointer ${
              isOutOfStock
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : adding
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white shadow-2xs'
            }`}
            aria-label={isOutOfStock ? `${product.name} is sold out` : `Add ${product.name} to cart`}
          >
            {isOutOfStock ? (
              <span className="text-[11px]">Sold Out</span>
            ) : adding ? (
              <>
                <Check size={12} strokeWidth={2.5} />
                <span className="hidden sm:inline">Added</span>
              </>
            ) : (
              <>
                <ShoppingBag size={12} />
                <span>Add</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
