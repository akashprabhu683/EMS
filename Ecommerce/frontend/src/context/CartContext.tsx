import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import type { CartItem, Product } from '../types';
import { useAuth } from './AuthContext';
import { getTrustedProducts } from '../services/productService';
import {
  fetchRemoteCart,
  persistRemoteCart,
  loadGuestCart,
  saveGuestCart,
  clearGuestCart,
  resolveCartItems,
  mergeStoredCarts,
  toStoredCartItems,
} from '../services/cartService';

export interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  totalItems: number;
  totalPrice: number;
  isLoading: boolean;
  error: string | null;
  addItem: (product: Product, quantity?: number, color?: string, size?: string) => void;
  removeItem: (productId: string, color?: string, size?: string) => void;
  updateQuantity: (productId: string, quantity: number, color?: string, size?: string) => void;
  clearCart: () => void;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextType | null>(null);

function isSameItem(item: CartItem, productId: string, color?: string, size?: string): boolean {
  if (item.product.id !== productId) return false;
  if (color !== undefined && item.selectedColor !== color) return false;
  if (size !== undefined && item.selectedSize !== size) return false;
  return true;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();

  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep a cached copy of trusted products for rapid resolution
  const trustedProductsRef = useRef<Product[]>([]);
  // Track previous authenticated user ID to detect login / logout transitions
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  // Synchronize cart state to remote or local storage
  const syncStorage = useCallback(
    async (updatedItems: CartItem[], currentUserId: string | null) => {
      const stored = toStoredCartItems(updatedItems);
      try {
        if (currentUserId) {
          await persistRemoteCart(currentUserId, stored);
        } else {
          saveGuestCart(stored);
        }
        setError(null);
      } catch (err: any) {
        console.error('Failed to synchronize cart:', err);
        setError('Cart synchronization issue. Changes are saved locally.');
      }
    },
    []
  );

  // Initial cart loader and auth-state change synchronization
  useEffect(() => {
    if (authLoading) return;

    let isCancelled = false;

    async function initializeCart() {
      setIsLoading(true);
      setError(null);

      try {
        // Load trusted products (from Firestore with fallback)
        const products = await getTrustedProducts();
        if (isCancelled) return;
        trustedProductsRef.current = products;

        const currentUid = user?.id ?? null;
        const previousUid = prevUserIdRef.current;
        prevUserIdRef.current = currentUid;

        if (currentUid) {
          // Authenticated customer: check for guest cart to merge
          const guestItems = loadGuestCart();
          const remoteItems = await fetchRemoteCart(currentUid);
          if (isCancelled) return;

          let mergedStored = remoteItems;
          let shouldPersistRemote = false;

          if (guestItems.length > 0) {
            // Carefully merge guest items without duplicate rows
            mergedStored = mergeStoredCarts(remoteItems, guestItems, products);
            clearGuestCart();
            shouldPersistRemote = true;
          }

          // Resolve against trusted products (deriving prices & validating stocks)
          const { validItems, hasChanged } = resolveCartItems(mergedStored, products);
          setItems(validItems);

          if (shouldPersistRemote || hasChanged) {
            await persistRemoteCart(currentUid, toStoredCartItems(validItems));
          }
        } else {
          // Guest user: load from localStorage
          if (previousUid && previousUid !== null) {
            // User just logged out — reset in-memory cart to empty guest cart
            clearGuestCart();
            setItems([]);
          } else {
            const guestItems = loadGuestCart();
            const { validItems, hasChanged } = resolveCartItems(guestItems, products);
            setItems(validItems);
            if (hasChanged) {
              saveGuestCart(toStoredCartItems(validItems));
            }
          }
        }
      } catch (err: any) {
        console.error('Error initializing cart:', err);
        if (!isCancelled) {
          setError('Could not restore saved cart from server.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    initializeCart();

    return () => {
      isCancelled = true;
    };
  }, [user, authLoading]);

  // Total items count (sum of all quantities)
  const totalItems = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  // Total price derived from trusted product prices
  const totalPrice = useMemo(
    () => items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [items]
  );

  // Add Item with stock validation & price derivation
  const addItem = useCallback(
    (product: Product, quantity = 1, color?: string, size?: string) => {
      if (!product || product.stock <= 0) {
        setError(`"${product?.name || 'Item'}" is currently out of stock.`);
        return;
      }

      const addQuantity = Math.max(1, Math.floor(quantity));

      setItems(prev => {
        const existingIdx = prev.findIndex(i =>
          isSameItem(i, product.id, color, size)
        );

        let nextItems: CartItem[];

        if (existingIdx >= 0) {
          const existing = prev[existingIdx];
          const newQty = Math.min(existing.quantity + addQuantity, product.stock);

          nextItems = prev.map((item, idx) =>
            idx === existingIdx ? { ...item, quantity: newQty } : item
          );
        } else {
          const boundedQty = Math.min(addQuantity, product.stock);
          nextItems = [
            ...prev,
            {
              product,
              quantity: boundedQty,
              selectedColor: color,
              selectedSize: size,
            },
          ];
        }

        // Persist
        syncStorage(nextItems, user?.id ?? null);
        return nextItems;
      });
    },
    [syncStorage, user]
  );

  // Remove Item
  const removeItem = useCallback(
    (productId: string, color?: string, size?: string) => {
      setItems(prev => {
        const nextItems = prev.filter(
          item => !isSameItem(item, productId, color, size)
        );
        syncStorage(nextItems, user?.id ?? null);
        return nextItems;
      });
    },
    [syncStorage, user]
  );

  // Update Item Quantity with boundary validation
  const updateQuantity = useCallback(
    (productId: string, quantity: number, color?: string, size?: string) => {
      setItems(prev => {
        if (quantity <= 0) {
          const nextItems = prev.filter(
            item => !isSameItem(item, productId, color, size)
          );
          syncStorage(nextItems, user?.id ?? null);
          return nextItems;
        }

        const nextItems = prev.map(item => {
          if (isSameItem(item, productId, color, size)) {
            const boundedQty = Math.min(
              Math.max(1, Math.floor(quantity)),
              item.product.stock
            );
            return { ...item, quantity: boundedQty };
          }
          return item;
        });

        syncStorage(nextItems, user?.id ?? null);
        return nextItems;
      });
    },
    [syncStorage, user]
  );

  // Clear Cart
  const clearCart = useCallback(() => {
    setItems([]);
    syncStorage([], user?.id ?? null);
  }, [syncStorage, user]);

  // Drawer toggles
  const toggleCart = useCallback(() => setIsOpen(open => !open), []);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        totalItems,
        totalPrice,
        isLoading,
        error,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        toggleCart,
        openCart,
        closeCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
