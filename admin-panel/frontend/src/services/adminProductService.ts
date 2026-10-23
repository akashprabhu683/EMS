import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Product, ProductFormData } from '../types';

function docToProduct(id: string, data: DocumentData): Product {
  return {
    id,
    name: String(data.name ?? ''),
    description: String(data.description ?? ''),
    categoryId: String(data.categoryId ?? ''),
    price: Math.max(0, Math.round(Number(data.price ?? 0))),
    imageUrl: typeof data.imageUrl === 'string' && data.imageUrl.startsWith('https://')
      ? data.imageUrl
      : undefined,
    stock: Math.max(0, Math.round(Number(data.stock ?? 0))),
    lowStockThreshold: data.lowStockThreshold !== undefined ? Math.max(0, Math.round(Number(data.lowStockThreshold))) : 5,
    isActive: Boolean(data.isActive),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

export function rupeesToPaise(rupeesInput: string | number): number {
  const num = typeof rupeesInput === 'number' ? rupeesInput : parseFloat(rupeesInput);
  if (isNaN(num) || num < 0) {
    throw new Error('Price must be a valid non-negative number.');
  }
  return Math.round(num * 100);
}

export function paiseToRupees(paise: number): string {
  const rupees = paise / 100;
  return rupees.toFixed(2);
}

export function validateProductForm(form: ProductFormData): string | null {
  if (!form.name.trim()) {
    return 'Product name is required.';
  }
  if (!form.description.trim()) {
    return 'Product description is required.';
  }
  if (!form.categoryId.trim()) {
    return 'Please select a valid category.';
  }

  const priceNum = parseFloat(form.priceRupees);
  if (isNaN(priceNum) || priceNum < 0) {
    return 'Price must be a non-negative number.';
  }

  const stockNum = parseInt(form.stock, 10);
  if (isNaN(stockNum) || stockNum < 0 || stockNum.toString() !== form.stock.trim()) {
    return 'Stock must be a non-negative whole integer.';
  }

  if (form.lowStockThreshold && form.lowStockThreshold.trim()) {
    const thresholdNum = parseInt(form.lowStockThreshold, 10);
    if (isNaN(thresholdNum) || thresholdNum < 0) {
      return 'Low-stock threshold must be a non-negative whole integer.';
    }
  }

  if (form.imageUrl.trim() && !form.imageUrl.trim().startsWith('https://')) {
    return 'Image URL must be a secure HTTPS link (https://...).';
  }

  return null;
}

/**
 * Fetch all products from Firestore for the admin dashboard.
 *
 * Strategy: try ordered query first; fall back to unordered collection scan
 * if the composite index hasn't been built yet (common on fresh projects).
 * Seeded products from seed-firestore.ts use REST PATCH which stores createdAt
 * as an ISO string — so we sort client-side by name as the final stable fallback.
 */
export async function getAllProducts(): Promise<Product[]> {
  // Try ordered query (requires composite index on createdAt)
  try {
    const orderedQuery = query(
      collection(db, 'products'),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(orderedQuery);
    if (snapshot.docs.length > 0) {
      return snapshot.docs.map(docSnap => docToProduct(docSnap.id, docSnap.data()));
    }
  } catch {
    // Index not ready or createdAt missing — fall through to unordered scan
  }

  // Unordered scan — works regardless of index state
  try {
    const snapshot = await getDocs(collection(db, 'products'));
    const results = snapshot.docs.map(docSnap => docToProduct(docSnap.id, docSnap.data()));
    // Sort client-side: active first, then by name A→Z for stable ordering
    results.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return results;
  } catch (err: any) {
    throw new Error(`Failed to load products: ${err.message ?? err}`);
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  const docRef = doc(db, 'products', id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return docToProduct(snap.id, snap.data());
}

/**
 * Create a new product with a stable, human-readable ID.
 * Uses setDoc() with a slug derived from the product name so the admin panel
 * never generates auto-IDs (which caused image-flicker in the storefront).
 */
export async function createProduct(form: ProductFormData): Promise<string> {
  const validationError = validateProductForm(form);
  if (validationError) {
    throw new Error(validationError);
  }

  const priceInPaise = rupeesToPaise(form.priceRupees);
  const stock = parseInt(form.stock, 10);
  const lowStockThreshold = form.lowStockThreshold && form.lowStockThreshold.trim() ? parseInt(form.lowStockThreshold, 10) : 5;

  // Generate stable slug ID: prod_{slug} — e.g. prod_ashwagandha_capsules
  const slug = form.name.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  // Append short timestamp suffix to avoid collisions with same-named products
  const stableId = `prod_${slug}_${Date.now().toString(36)}`;

  const payload: Record<string, any> = {
    name: form.name.trim(),
    description: form.description.trim(),
    categoryId: form.categoryId.trim(),
    category: form.categoryId.trim(),
    categorySlug: form.categoryId.trim(),
    price: priceInPaise,
    stock,
    lowStockThreshold,
    isActive: Boolean(form.isActive),
    rating: 4.5,
    reviewCount: 0,
    featured: false,
    isNew: true,
    tags: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (form.imageUrl.trim()) {
    payload.imageUrl = form.imageUrl.trim();
    payload.images = [form.imageUrl.trim()];
  }

  // Use setDoc with explicit stable ID instead of addDoc (which creates auto-IDs)
  const docRef = doc(db, 'products', stableId);
  await setDoc(docRef, payload);
  return stableId;
}

export async function updateProduct(id: string, form: ProductFormData): Promise<void> {
  const validationError = validateProductForm(form);
  if (validationError) {
    throw new Error(validationError);
  }

  const priceInPaise = rupeesToPaise(form.priceRupees);
  const stock = parseInt(form.stock, 10);
  const lowStockThreshold = form.lowStockThreshold && form.lowStockThreshold.trim() ? parseInt(form.lowStockThreshold, 10) : 5;

  const docRef = doc(db, 'products', id);
  const payload: Record<string, any> = {
    name: form.name.trim(),
    description: form.description.trim(),
    categoryId: form.categoryId.trim(),
    category: form.categoryId.trim(),
    categorySlug: form.categoryId.trim(),
    price: priceInPaise,
    stock,
    lowStockThreshold,
    isActive: Boolean(form.isActive),
    updatedAt: serverTimestamp(),
  };

  if (form.imageUrl.trim()) {
    payload.imageUrl = form.imageUrl.trim();
    payload.images = [form.imageUrl.trim()];
  } else {
    payload.imageUrl = '';
    payload.images = [];
  }

  await updateDoc(docRef, payload);
}

export async function setProductActiveStatus(id: string, isActive: boolean): Promise<void> {
  const docRef = doc(db, 'products', id);
  await updateDoc(docRef, {
    isActive,
    updatedAt: serverTimestamp(),
  });
}
