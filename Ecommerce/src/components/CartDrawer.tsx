import { X, Minus, Plus, ShoppingBag, Trash2, ArrowRight, ShieldCheck } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { Link } from 'react-router-dom';
import { useEffect, useRef } from 'react';

export function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, totalPrice, totalItems, clearCart } = useCart();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Trap scroll when open and handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeCart();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeCart]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Shopping Cart Drawer"
    >
      {/* Semi-flat Clean Backdrop with light blur */}
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
            <ShoppingBag size={20} className="text-blue-600" />
            <h2 className="font-display font-bold text-lg text-slate-900">Your Cart</h2>
            {totalItems > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
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
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Close cart"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Free Shipping Progress Pill */}
        {items.length > 0 && (
          <div className="px-6 py-3 bg-blue-50/70 border-b border-blue-100/80 text-xs text-blue-900 flex items-center justify-between">
            {totalPrice >= 50 ? (
              <span className="font-semibold text-emerald-700 flex items-center gap-1.5">
                ✓ You unlocked Free Global Delivery!
              </span>
            ) : (
              <span>
                Add <strong>${(50 - totalPrice).toFixed(2)}</strong> more for <strong>Free Shipping</strong>
              </span>
            )}
            <span className="text-[11px] font-bold text-blue-600 bg-white px-2 py-0.5 rounded border border-blue-200/80">
              Goal: $50
            </span>
          </div>
        )}

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                <ShoppingBag size={28} />
              </div>
              <div className="space-y-1">
                <h3 className="text-slate-900 font-bold text-base">Your cart is currently empty</h3>
                <p className="text-slate-500 text-xs max-w-xs">Explore curated electronics, minimalist apparel, and home essentials.</p>
              </div>
              <button
                id="cart-continue-shopping-btn"
                onClick={closeCart}
                className="btn-primary py-2.5 px-6 text-xs rounded-xl mt-3 shadow-2xs"
              >
                Start Browsing
              </button>
            </div>
          ) : (
            items.map(item => (
              <div
                key={item.product.id}
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
                      className="text-xs sm:text-sm font-semibold text-slate-900 hover:text-blue-600 line-clamp-1 transition-colors"
                    >
                      {item.product.name}
                    </Link>
                    {item.selectedSize && (
                      <p className="text-[11px] text-slate-500 mt-0.5">Size: {item.selectedSize}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
                    {/* Stepper */}
                    <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg p-0.5 bg-slate-50">
                      <button
                        id={`cart-qty-decrease-${item.product.id}`}
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="w-6 h-6 rounded bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors shadow-2xs focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={11} />
                      </button>
                      <span className="text-xs font-semibold text-slate-900 w-6 text-center">{item.quantity}</span>
                      <button
                        id={`cart-qty-increase-${item.product.id}`}
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        disabled={item.quantity >= item.product.stock}
                        className="w-6 h-6 rounded bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors shadow-2xs disabled:opacity-40 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                        aria-label="Increase quantity"
                      >
                        <Plus size={11} />
                      </button>
                    </div>

                    {/* Price & Delete */}
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs sm:text-sm font-bold text-slate-900">
                        ${(item.product.price * item.quantity).toFixed(2)}
                      </span>
                      <button
                        id={`cart-remove-${item.product.id}`}
                        onClick={() => removeItem(item.product.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-500"
                        aria-label="Remove item"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Order Summary */}
        {items.length > 0 && (
          <div className="p-6 border-t border-slate-200 bg-slate-50/70 space-y-4">
            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-slate-900 font-semibold">${totalPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Shipping</span>
                <span className={totalPrice >= 50 ? 'text-emerald-700 font-semibold' : 'text-slate-900 font-semibold'}>
                  {totalPrice >= 50 ? 'FREE' : '$9.99'}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Total Due</span>
                <span className="text-blue-600">${(totalPrice + (totalPrice < 50 ? 9.99 : 0)).toFixed(2)}</span>
              </div>
            </div>

            <Link
              to="/checkout"
              id="cart-checkout-btn"
              onClick={closeCart}
              className="btn-primary w-full py-3 text-sm rounded-xl justify-center shadow-xs"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight size={15} />
            </Link>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 pt-1">
              <ShieldCheck size={13} className="text-emerald-600" />
              <span>Guaranteed safe & encrypted checkout</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
