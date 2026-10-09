import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { CartItem, Product } from '../types';

interface CartState {
  items: CartItem[];
  isOpen: boolean;
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: { product: Product; quantity?: number; selectedColor?: string; selectedSize?: string } }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { productId: string; quantity: number } }
  | { type: 'CLEAR_CART' }
  | { type: 'TOGGLE_CART' }
  | { type: 'OPEN_CART' }
  | { type: 'CLOSE_CART' };

interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  totalItems: number;
  totalPrice: number;
  addItem: (product: Product, quantity?: number, color?: string, size?: string) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const { product, quantity = 1, selectedColor, selectedSize } = action.payload;
      const existing = state.items.find(i => i.product.id === product.id);
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            i.product.id === product.id
              ? { ...i, quantity: Math.min(i.quantity + quantity, product.stock) }
              : i
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, { product, quantity, selectedColor, selectedSize }],
      };
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(i => i.product.id !== action.payload) };
    case 'UPDATE_QUANTITY':
      return {
        ...state,
        items: action.payload.quantity <= 0
          ? state.items.filter(i => i.product.id !== action.payload.productId)
          : state.items.map(i =>
              i.product.id === action.payload.productId
                ? { ...i, quantity: action.payload.quantity }
                : i
            ),
      };
    case 'CLEAR_CART':
      return { ...state, items: [] };
    case 'TOGGLE_CART':
      return { ...state, isOpen: !state.isOpen };
    case 'OPEN_CART':
      return { ...state, isOpen: true };
    case 'CLOSE_CART':
      return { ...state, isOpen: false };
    default:
      return state;
  }
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], isOpen: false });

  const totalItems = state.items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = state.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  const addItem    = useCallback((p: Product, qty = 1, color?: string, size?: string) =>
    dispatch({ type: 'ADD_ITEM', payload: { product: p, quantity: qty, selectedColor: color, selectedSize: size } }), []);
  const removeItem = useCallback((id: string) => dispatch({ type: 'REMOVE_ITEM', payload: id }), []);
  const updateQuantity = useCallback((id: string, qty: number) =>
    dispatch({ type: 'UPDATE_QUANTITY', payload: { productId: id, quantity: qty } }), []);
  const clearCart  = useCallback(() => dispatch({ type: 'CLEAR_CART' }), []);
  const toggleCart = useCallback(() => dispatch({ type: 'TOGGLE_CART' }), []);
  const openCart   = useCallback(() => dispatch({ type: 'OPEN_CART' }), []);
  const closeCart  = useCallback(() => dispatch({ type: 'CLOSE_CART' }), []);

  return (
    <CartContext.Provider value={{
      items: state.items, isOpen: state.isOpen,
      totalItems, totalPrice,
      addItem, removeItem, updateQuantity, clearCart,
      toggleCart, openCart, closeCart,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
