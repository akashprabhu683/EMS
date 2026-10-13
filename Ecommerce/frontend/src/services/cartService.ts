import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { CartItem, Product } from '../types';

export interface StoredCartItem {
  productId: string;
  quantity: number;
  selectedColor?: string;
  selectedSize?: string;
}

const GUEST_CART_STORAGE_KEY = 'ems_guest_cart_v1';

/**
 * Loads the guest cart from localStorage.
 */
export function loadGuestCart(): StoredCartItem[] {
  try {
    const raw = localStorage.getItem(GUEST_CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is StoredCartItem =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.productId === 'string' &&
        item.productId.trim().length > 0 &&
        typeof item.quantity === 'number' &&
        !isNaN(item.quantity) &&
        item.quantity > 0
      )
      .map(item => ({
        productId: item.productId.trim(),
        quantity: Math.max(1, Math.floor(item.quantity)),
        selectedColor: typeof item.selectedColor === 'string' ? item.selectedColor : undefined,
        selectedSize: typeof item.selectedSize === 'string' ? item.selectedSize : undefined,
      }));
  } catch (err) {
    console.error('Failed to load guest cart from localStorage:', err);
    return [];
  }
}

/**
 * Saves the guest cart to localStorage.
 */
export function saveGuestCart(items: StoredCartItem[]): void {
  try {
    if (items.length === 0) {
      localStorage.removeItem(GUEST_CART_STORAGE_KEY);
    } else {
      localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(items));
    }
  } catch (err) {
    console.error('Failed to save guest cart to localStorage:', err);
  }
}

/**
 * Clears the guest cart from localStorage.
 */
export function clearGuestCart(): void {
  try {
    localStorage.removeItem(GUEST_CART_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear guest cart from localStorage:', err);
  }
}

/**
 * Fetches the customer's remote cart document from Firestore (carts/{uid}).
 */
export async function fetchRemoteCart(uid: string): Promise<StoredCartItem[]> {
  if (!uid) return [];

  const cartRef = doc(db, 'carts', uid);
  const snap = await getDoc(cartRef);

  if (!snap.exists()) {
    return [];
  }

  const data = snap.data();
  if (!Array.isArray(data?.items)) {
    return [];
  }

  const sanitized: StoredCartItem[] = [];
  for (const raw of data.items) {
    if (
      typeof raw === 'object' &&
      raw !== null &&
      typeof raw.productId === 'string' &&
      raw.productId.trim().length > 0 &&
      typeof raw.quantity === 'number' &&
      !isNaN(raw.quantity) &&
      raw.quantity > 0
    ) {
      sanitized.push({
        productId: raw.productId.trim(),
        quantity: Math.max(1, Math.floor(raw.quantity)),
        selectedColor: typeof raw.selectedColor === 'string' ? raw.selectedColor : undefined,
        selectedSize: typeof raw.selectedSize === 'string' ? raw.selectedSize : undefined,
      });
    }
  }

  return sanitized;
}

/**
 * Persists the customer's cart to Firestore (carts/{uid}).
 * Never stores prices — only references (productId, quantity, variants).
 */
export async function persistRemoteCart(uid: string, items: StoredCartItem[]): Promise<void> {
  if (!uid) return;

  const cartRef = doc(db, 'carts', uid);
  const payload = {
    items: items.map(item => ({
      productId: item.productId,
      quantity: Math.max(1, Math.floor(item.quantity)),
      ...(item.selectedColor ? { selectedColor: item.selectedColor } : {}),
      ...(item.selectedSize ? { selectedSize: item.selectedSize } : {}),
    })),
    updatedAt: serverTimestamp(),
  };

  await setDoc(cartRef, payload, { merge: true });
}

/**
 * Converts rich in-memory CartItem[] to lightweight StoredCartItem[] for persistence.
 */
export function toStoredCartItems(cartItems: CartItem[]): StoredCartItem[] {
  return cartItems.map(item => ({
    productId: item.product.id,
    quantity: item.quantity,
    ...(item.selectedColor ? { selectedColor: item.selectedColor } : {}),
    ...(item.selectedSize ? { selectedSize: item.selectedSize } : {}),
  }));
}

/**
 * Resolves stored cart items against authoritative, trusted product data.
 * Prices are strictly derived from trusted products.
 * Handles inactive, unavailable, or out-of-stock products gracefully.
 */
export function resolveCartItems(
  storedItems: StoredCartItem[],
  trustedProducts: Product[]
): { validItems: CartItem[]; hasChanged: boolean } {
  const productMap = new Map<string, Product>();
  for (const p of trustedProducts) {
    productMap.set(p.id, p);
  }

  const validItems: CartItem[] = [];
  let hasChanged = false;

  for (const stored of storedItems) {
    const product = productMap.get(stored.productId);

    // Product no longer exists, is inactive, or has 0 stock -> omit gracefully
    if (!product || product.stock <= 0) {
      hasChanged = true;
      continue;
    }

    // Validate and clamp quantity to available stock
    const requestedQty = Math.max(1, Math.floor(stored.quantity));
    const boundedQty = Math.min(requestedQty, product.stock);

    if (boundedQty !== stored.quantity) {
      hasChanged = true;
    }

    validItems.push({
      product,
      quantity: boundedQty,
      selectedColor: stored.selectedColor,
      selectedSize: stored.selectedSize,
    });
  }

  return { validItems, hasChanged };
}

/**
 * Merges guest cart items into an authenticated user's remote cart.
 * Prevents unintentional duplicates by combining quantities of identical items/variants,
 * capped at each product's available stock.
 */
export function mergeStoredCarts(
  remoteItems: StoredCartItem[],
  guestItems: StoredCartItem[],
  trustedProducts: Product[]
): StoredCartItem[] {
  const productMap = new Map<string, Product>();
  for (const p of trustedProducts) {
    productMap.set(p.id, p);
  }

  const mergedMap = new Map<string, StoredCartItem>();
  const makeKey = (item: StoredCartItem) =>
    `${item.productId}__${item.selectedColor || ''}__${item.selectedSize || ''}`;

  // 1. Seed with existing remote items
  for (const item of remoteItems) {
    const key = makeKey(item);
    mergedMap.set(key, { ...item });
  }

  // 2. Merge guest items into map
  for (const guestItem of guestItems) {
    const key = makeKey(guestItem);
    const product = productMap.get(guestItem.productId);
    const maxStock = product ? product.stock : 999;

    const existing = mergedMap.get(key);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + guestItem.quantity, maxStock);
    } else {
      mergedMap.set(key, {
        ...guestItem,
        quantity: Math.min(guestItem.quantity, maxStock),
      });
    }
  }

  return Array.from(mergedMap.values());
}
