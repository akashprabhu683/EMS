import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  type DocumentData,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from '../firebase';
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
  if (isNaN(priceNum) || priceNum <= 0) {
    return 'Price must be a positive number.';
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

  if (form.imageUrl.trim() && !form.imageUrl.trim().startsWith('https://') && !form.imageUrl.trim().startsWith('data:image/')) {
    return 'Image URL must be a secure HTTPS link or valid image data.';
  }

  return null;
}

/**
 * Fetch all products from Firestore for the admin dashboard.
 */
export async function getAllProducts(): Promise<Product[]> {
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

  try {
    const snapshot = await getDocs(collection(db, 'products'));
    const results = snapshot.docs.map(docSnap => docToProduct(docSnap.id, docSnap.data()));
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
 * Helper to get authorization headers for Express fallback
 */
async function getAuthHeader(): Promise<Record<string, string>> {
  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  return {
    'Content-Type': 'application/json',
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };
}

/**
 * Authoritatively creates a product via Cloud Function, falling back to Express API.
 * Never writes directly to Firestore from the client.
 */
export async function createProduct(form: ProductFormData): Promise<string> {
  const validationError = validateProductForm(form);
  if (validationError) {
    throw new Error(validationError);
  }

  const pricePaise = rupeesToPaise(form.priceRupees);
  const stock = parseInt(form.stock, 10);
  const lowStockThreshold = form.lowStockThreshold && form.lowStockThreshold.trim() ? parseInt(form.lowStockThreshold, 10) : 5;

  const payload = {
    name: form.name.trim(),
    description: form.description.trim(),
    categoryId: form.categoryId.trim(),
    pricePaise,
    stock,
    lowStockThreshold,
    isActive: Boolean(form.isActive),
    imageUrl: form.imageUrl.trim() || undefined,
  };

  // 1. Primary: Authoritative Cloud Function
  try {
    const createFn = httpsCallable<typeof payload, { productId: string; success: boolean }>(functions, 'createAdminProduct');
    const res = await createFn(payload);
    if (res.data?.productId) {
      return res.data.productId;
    }
  } catch (fnErr: any) {
    console.warn('createAdminProduct Cloud Function failed, checking Express fallback:', fnErr);
    const errorCode = String(fnErr?.code || '').toLowerCase();
    const isDomainError =
      errorCode.includes('invalid-argument') ||
      errorCode.includes('permission-denied') ||
      errorCode.includes('already-exists');
    if (isDomainError) {
      throw new Error(fnErr.message || 'Validation error creating product');
    }
  }

  // 2. Secondary: Express Backend API Fallback
  const adminBackendUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_ADMIN_API_URL;
  if (adminBackendUrl) {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${adminBackendUrl.replace(/\/$/, '')}/api/admin/products`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        return data.productId;
      }
      const errData = await res.json().catch(() => ({}));
      if (errData?.error) {
        throw new Error(errData.error);
      }
    } catch (apiErr: any) {
      console.warn('Express /api/admin/products failed:', apiErr);
      if (apiErr?.message && !apiErr.message.includes('fetch') && !apiErr.message.includes('network')) {
        throw apiErr;
      }
    }
  }

  throw new Error('Unable to create product at this time. Trusted backend validation is unreachable.');
}

/**
 * Authoritatively updates a product via Cloud Function, falling back to Express API.
 * Never writes directly to Firestore from the client.
 */
export async function updateProduct(id: string, form: ProductFormData, expectedCurrentStock?: number): Promise<void> {
  const validationError = validateProductForm(form);
  if (validationError) {
    throw new Error(validationError);
  }

  const pricePaise = rupeesToPaise(form.priceRupees);
  const stock = parseInt(form.stock, 10);
  const lowStockThreshold = form.lowStockThreshold && form.lowStockThreshold.trim() ? parseInt(form.lowStockThreshold, 10) : 5;
  const expectedStock = expectedCurrentStock ?? (form.expectedCurrentStock !== undefined ? Number(form.expectedCurrentStock) : undefined);

  const payload: Record<string, any> = {
    productId: id,
    name: form.name.trim(),
    description: form.description.trim(),
    categoryId: form.categoryId.trim(),
    pricePaise,
    stock,
    lowStockThreshold,
    isActive: Boolean(form.isActive),
    imageUrl: form.imageUrl.trim() || undefined,
  };
  if (expectedStock !== undefined && !isNaN(expectedStock)) {
    payload.expectedCurrentStock = expectedStock;
  }

  // 1. Primary: Authoritative Cloud Function
  try {
    const updateFn = httpsCallable<typeof payload, { productId: string; success: boolean }>(functions, 'updateAdminProduct');
    await updateFn(payload);
    return;
  } catch (fnErr: any) {
    console.warn('updateAdminProduct Cloud Function failed, checking Express fallback:', fnErr);
    const errorCode = String(fnErr?.code || '').toLowerCase();
    const isDomainError =
      errorCode.includes('invalid-argument') ||
      errorCode.includes('permission-denied') ||
      errorCode.includes('not-found');
    if (isDomainError) {
      throw new Error(fnErr.message || 'Validation error updating product');
    }
  }

  // 2. Secondary: Express Backend API Fallback
  const adminBackendUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_ADMIN_API_URL;
  if (adminBackendUrl) {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${adminBackendUrl.replace(/\/$/, '')}/api/admin/products/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) return;
      const errData = await res.json().catch(() => ({}));
      if (errData?.error) {
        throw new Error(errData.error);
      }
    } catch (apiErr: any) {
      console.warn('Express /api/admin/products/:id failed:', apiErr);
      if (apiErr?.message && !apiErr.message.includes('fetch') && !apiErr.message.includes('network')) {
        throw apiErr;
      }
    }
  }

  throw new Error('Unable to update product at this time. Trusted backend validation is unreachable.');
}

/**
 * Authoritatively adjusts product inventory via Cloud Function or Express.
 */
export async function adjustProductStock(
  productId: string,
  adjustmentType: 'set' | 'delta',
  value: number,
  reason?: string
): Promise<{ previousStock: number; newStock: number }> {
  const payload = { productId, adjustmentType, value, reason };

  // 1. Primary: Cloud Function
  try {
    const adjustFn = httpsCallable<typeof payload, { previousStock: number; newStock: number }>(functions, 'adjustAdminProductStock');
    const res = await adjustFn(payload);
    return res.data;
  } catch (fnErr: any) {
    console.warn('adjustAdminProductStock Cloud Function failed, checking Express fallback:', fnErr);
    const errorCode = String(fnErr?.code || '').toLowerCase();
    if (errorCode.includes('invalid-argument') || errorCode.includes('failed-precondition')) {
      throw new Error(fnErr.message);
    }
  }

  // 2. Secondary: Express Backend API Fallback
  const adminBackendUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_ADMIN_API_URL;
  if (adminBackendUrl) {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${adminBackendUrl.replace(/\/$/, '')}/api/admin/products/${productId}/stock`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        return await res.json();
      }
      const errData = await res.json().catch(() => ({}));
      if (errData?.error) {
        throw new Error(errData.error);
      }
    } catch (apiErr: any) {
      if (apiErr?.message && !apiErr.message.includes('fetch') && !apiErr.message.includes('network')) {
        throw apiErr;
      }
    }
  }

  throw new Error('Unable to adjust stock at this time. Trusted backend validation is unreachable.');
}

/**
 * Authoritatively sets product active status via Cloud Function or Express API.
 */
export async function setProductActiveStatus(id: string, isActive: boolean): Promise<void> {
  const payload = { productId: id, isActive };

  // 1. Primary: Cloud Function
  try {
    const setStatusFn = httpsCallable<typeof payload, { productId: string; isActive: boolean }>(functions, 'setAdminProductStatus');
    await setStatusFn(payload);
    return;
  } catch (fnErr: any) {
    console.warn('setAdminProductStatus Cloud Function failed, checking Express fallback:', fnErr);
    const errorCode = String(fnErr?.code || '').toLowerCase();
    if (errorCode.includes('invalid-argument') || errorCode.includes('permission-denied') || errorCode.includes('not-found')) {
      throw new Error(fnErr.message);
    }
  }

  // 2. Secondary: Express Backend API Fallback
  const adminBackendUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_ADMIN_API_URL;
  if (adminBackendUrl) {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${adminBackendUrl.replace(/\/$/, '')}/api/admin/products/${id}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isActive }),
      });

      if (res.ok) return;
      const errData = await res.json().catch(() => ({}));
      if (errData?.error) {
        throw new Error(errData.error);
      }
    } catch (apiErr: any) {
      if (apiErr?.message && !apiErr.message.includes('fetch') && !apiErr.message.includes('network')) {
        throw apiErr;
      }
    }
  }

  throw new Error('Unable to update product status at this time. Trusted backend validation is unreachable.');
}

/**
 * Authoritatively deletes a product via Cloud Function or Express API.
 * Rejects deletion if existing customer orders reference the product.
 */
export async function deleteProduct(id: string): Promise<void> {
  const payload = { productId: id };

  // 1. Primary: Cloud Function
  try {
    const deleteFn = httpsCallable<typeof payload, { productId: string; success: boolean }>(functions, 'deleteAdminProduct');
    await deleteFn(payload);
    return;
  } catch (fnErr: any) {
    console.warn('deleteAdminProduct Cloud Function failed, checking Express fallback:', fnErr);
    const errorCode = String(fnErr?.code || '').toLowerCase();
    if (errorCode.includes('failed-precondition') || errorCode.includes('permission-denied') || errorCode.includes('not-found')) {
      throw new Error(fnErr.message);
    }
  }

  // 2. Secondary: Express Backend API Fallback
  const adminBackendUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_ADMIN_API_URL;
  if (adminBackendUrl) {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${adminBackendUrl.replace(/\/$/, '')}/api/admin/products/${id}`, {
        method: 'DELETE',
        headers,
      });

      if (res.ok) return;
      const errData = await res.json().catch(() => ({}));
      if (errData?.error) {
        throw new Error(errData.error);
      }
    } catch (apiErr: any) {
      if (apiErr?.message && !apiErr.message.includes('fetch') && !apiErr.message.includes('network')) {
        throw apiErr;
      }
    }
  }

  throw new Error('Unable to delete product at this time. Trusted backend validation is unreachable.');
}
