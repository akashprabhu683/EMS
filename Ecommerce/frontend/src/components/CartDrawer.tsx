import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  X,
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  MapPin,
} from 'lucide-react';
import { useCart } from '../context/CartContext';

export function CartDrawer() {
  const {
    items,
    totalItems,
    totalPrice,
    isOpen,
    closeCart,
    updateQuantity,
    removeItem,
    clearCart,
    isLoading,
    error,
  } = useCart();

  const overlayRef = useRef<HTMLDivElement>(null);

  // Close drawer on Esc key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeCart();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeCart]);

  // Lock background scroll when drawer is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity animate-fade-in"
        onClick={closeCart}
      />

      {/* Drawer Surface — slides in from right */}
      <div className="relative w-full max-w-md h-full bg-white border-l border-slate-200 flex flex-col shadow-2xl animate-slide-in-right z-10">
        {/* Header with comfortable padding and distinct divider */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2.5">
            <ShoppingBag size={20} className="text-emerald-700" />
            <h2 className="font-display font-bold text-lg text-slate-900">Your Cart</h2>
            {totalItems > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                {totalItems}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {items.length > 0 && (
              <button
                id="cart-clear-btn"
                onClick={clearCart}
                className="text-xs font-medium text-slate-400 hover:text-rose-600 flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded-md px-1 py-0.5"
              >
                <Trash2 size={13} /> Clear all
              </button>
            )}
            <button
              id="cart-close-btn"
              onClick={closeCart}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label="Close cart"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Error notification banner if any */}
        {error && (
          <div className="px-6 py-2.5 bg-rose-50 border-b border-rose-200 text-xs text-rose-700 flex items-center justify-between">
            <span>{error}</span>
          </div>
        )}

        {/* Click and Collect Notification Pill */}
        {items.length > 0 && (
          <div className="px-6 py-3 bg-emerald-50/70 border-b border-emerald-100/80 text-xs text-emerald-950 flex items-center justify-between">
            <span className="font-semibold text-emerald-800 flex items-center gap-1.5">
              <MapPin size={13} className="text-emerald-600 shrink-0" />
              <span>Click &amp; Collect — Pay in person at counter</span>
            </span>
            <span className="text-[11px] font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200/80">
              FREE Pickup
            </span>
          </div>
        )}

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {isLoading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
              <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-semibold text-slate-500">Restoring your cart...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                <ShoppingBag size={28} />
              </div>
              <div className="space-y-1">
                <h3 className="text-slate-900 font-bold text-base">Your cart is currently empty</h3>
                <p className="text-slate-500 text-xs max-w-xs">Explore authentic Ayurvedic formulations, herbal extracts, and natural remedies.</p>
              </div>
              <button
                id="cart-continue-shopping-btn"
                onClick={closeCart}
                className="btn-primary py-2.5 px-6 text-xs rounded-xl mt-3 shadow-2xs"
              >
                Browse Herbal Catalog
              </button>
            </div>
          ) : (
            items.map(item => {
              const itemKey = `${item.product.id}-${item.selectedColor || ''}-${item.selectedSize || ''}`;
              return (
                <div
                  key={itemKey}
                  className="flex gap-3.5 bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs hover:border-slate-300 transition-colors"
                >
                  <Link to={`/product/${item.product.id}`} onClick={closeCart} className="shrink-0">
                    <img
                      src={item.product.images[0]}
                      alt={item.product.name}
                      className="w-16 h-16 object-cover rounded-xl bg-slate-100 border border-slate-100"
                    />
                  </Link>
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <Link
                        to={`/product/${item.product.id}`}
                        onClick={closeCart}
                        className="text-xs sm:text-sm font-semibold text-slate-900 hover:text-emerald-700 line-clamp-1 transition-colors"
                      >
                        {item.product.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.selectedSize && (
                          <span className="text-[11px] text-slate-500">Pack: {item.selectedSize}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
                      {/* Stepper */}
                      <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg p-0.5 bg-slate-50">
                        <button
                          id={`cart-qty-decrease-${item.product.id}`}
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.selectedColor, item.selectedSize)}
                          className="w-6 h-6 rounded bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors shadow-2xs focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={11} />
                        </button>
                        <span className="text-xs font-semibold text-slate-900 w-6 text-center">{item.quantity}</span>
                        <button
                          id={`cart-qty-increase-${item.product.id}`}
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1, item.selectedColor, item.selectedSize)}
                          disabled={item.quantity >= item.product.stock}
                          className="w-6 h-6 rounded bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors shadow-2xs disabled:opacity-40 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                          aria-label="Increase quantity"
                        >
                          <Plus size={11} />
                        </button>
                      </div>

                      {/* Price & Delete */}
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs sm:text-sm font-bold text-slate-900">
                          ₹{(item.product.price * item.quantity).toFixed(2)}
                        </span>
                        <button
                          id={`cart-remove-${item.product.id}`}
                          onClick={() => removeItem(item.product.id, item.selectedColor, item.selectedSize)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-500"
                          aria-label="Remove item"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Order Summary */}
        {items.length > 0 && (
          <div className="p-6 border-t border-slate-200 bg-slate-50/70 space-y-4">
            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-slate-900 font-semibold">₹{totalPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Counter Pickup Fee</span>
                <span className="text-emerald-700 font-semibold">FREE</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Total Due at Counter</span>
                <span className="text-emerald-800">₹{totalPrice.toFixed(2)}</span>
              </div>
            </div>

            <Link
              to="/checkout"
              id="cart-checkout-btn"
              onClick={closeCart}
              className="btn-primary w-full py-3 text-sm rounded-xl justify-center shadow-xs"
            >
              <span>Proceed to Click &amp; Collect</span>
              <ArrowRight size={15} />
            </Link>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 pt-1">
              <ShieldCheck size={13} className="text-emerald-600" />
              <span>Authentic herbal dispensary · Verified quality</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
