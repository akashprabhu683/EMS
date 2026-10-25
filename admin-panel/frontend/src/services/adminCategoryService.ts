import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  type DocumentData,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from '../firebase';
import type { Category, CategoryFormData } from '../types';

function docToCategory(id: string, data: DocumentData): Category {
  return {
    id,
    name: String(data.name ?? ''),
    slug: String(data.slug ?? ''),
    description: typeof data.description === 'string' ? data.description : undefined,
    isActive: Boolean(data.isActive),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function validateCategoryForm(form: CategoryFormData): string | null {
  if (!form.name.trim()) {
    return 'Category name is required.';
  }
  const cleanSlug = form.slug.trim();
  if (!cleanSlug) {
    return 'Category slug is required.';
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
    return 'Slug must only contain lowercase alphanumeric characters and single hyphens (e.g. "smart-watches").';
  }
  return null;
}

export async function getAllCategories(): Promise<Category[]> {
  const catQuery = query(
    collection(db, 'categories'),
    orderBy('name', 'asc')
  );

  try {
    const snap = await getDocs(catQuery);
    return snap.docs.map(d => docToCategory(d.id, d.data()));
  } catch {
    const fallbackSnap = await getDocs(collection(db, 'categories'));
    return fallbackSnap.docs.map(d => docToCategory(d.id, d.data()));
  }
}

export async function getActiveCategories(): Promise<Category[]> {
  const categories = await getAllCategories();
  return categories.filter(c => c.isActive);
}

export async function checkSlugAvailable(slug: string, excludeCategoryId?: string): Promise<boolean> {
  const cleanSlug = slug.trim().toLowerCase();
  const q = query(
    collection(db, 'categories'),
    where('slug', '==', cleanSlug)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return true;

  if (excludeCategoryId && snapshot.docs.length === 1 && snapshot.docs[0].id === excludeCategoryId) {
    return true;
  }

  return false;
}

export async function isCategoryReferencedByProducts(categoryId: string): Promise<boolean> {
  const q = query(
    collection(db, 'products'),
    where('categoryId', '==', categoryId),
    limit(1)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  return {
    'Content-Type': 'application/json',
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };
}

/**
 * Authoritatively creates a category via Cloud Function, falling back to Express API.
 * Never writes directly to Firestore from the client.
 */
export async function createCategory(form: CategoryFormData): Promise<string> {
  const validationError = validateCategoryForm(form);
  if (validationError) {
    throw new Error(validationError);
  }

  const cleanSlug = form.slug.trim().toLowerCase();
  const payload = {
    name: form.name.trim(),
    slug: cleanSlug,
    description: form.description ? form.description.trim() : undefined,
    isActive: Boolean(form.isActive),
  };

  // 1. Primary: Authoritative Express Backend API
  const adminBackendUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_ADMIN_API_URL;
  if (adminBackendUrl) {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${adminBackendUrl.replace(/\/$/, '')}/api/admin/categories`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        return data.categoryId;
      }
      const errData = await res.json().catch(() => ({}));
      if (errData?.error) {
        throw new Error(errData.error);
      }
    } catch (apiErr: any) {
      if (apiErr?.message && !apiErr.message.includes('fetch') && !apiErr.message.includes('network')) {
        throw apiErr;
      }
      console.warn('Express /api/admin/categories failed, checking Cloud Function fallback:', apiErr);
    }
  }

  // 2. Secondary: Cloud Function Fallback
  try {
    const createFn = httpsCallable<typeof payload, { categoryId: string; success: boolean }>(functions, 'createAdminCategory');
    const res = await createFn(payload);
    if (res.data?.categoryId) {
      return res.data.categoryId;
    }
  } catch (fnErr: any) {
    throw new Error(fnErr.message || 'Validation error creating category');
  }

  throw new Error('Unable to create category at this time. Trusted backend validation is unreachable.');
}

/**
 * Authoritatively updates a category via Express API, falling back to Cloud Function.
 */
export async function updateCategory(id: string, form: CategoryFormData): Promise<void> {
  const validationError = validateCategoryForm(form);
  if (validationError) {
    throw new Error(validationError);
  }

  const cleanSlug = form.slug.trim().toLowerCase();
  const payload = {
    categoryId: id,
    name: form.name.trim(),
    slug: cleanSlug,
    description: form.description ? form.description.trim() : '',
    isActive: Boolean(form.isActive),
  };

  // 1. Primary: Authoritative Express Backend API
  const adminBackendUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_ADMIN_API_URL;
  if (adminBackendUrl) {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${adminBackendUrl.replace(/\/$/, '')}/api/admin/categories/${id}`, {
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
      if (apiErr?.message && !apiErr.message.includes('fetch') && !apiErr.message.includes('network')) {
        throw apiErr;
      }
      console.warn('Express /api/admin/categories/:id failed, checking Cloud Function fallback:', apiErr);
    }
  }

  // 2. Secondary: Cloud Function Fallback
  try {
    const updateFn = httpsCallable<typeof payload, { categoryId: string; success: boolean }>(functions, 'updateAdminCategory');
    await updateFn(payload);
    return;
  } catch (fnErr: any) {
    throw new Error(fnErr.message || 'Validation error updating category');
  }
}

/**
 * Authoritatively sets category active status via Express API or Cloud Function.
 */
export async function setCategoryActiveStatus(id: string, isActive: boolean): Promise<void> {
  const payload = { categoryId: id, isActive };

  // 1. Primary: Express Backend API
  const adminBackendUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_ADMIN_API_URL;
  if (adminBackendUrl) {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${adminBackendUrl.replace(/\/$/, '')}/api/admin/categories/${id}/status`, {
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
      console.warn('Express set category status failed, checking Cloud Function fallback:', apiErr);
    }
  }

  // 2. Secondary: Cloud Function Fallback
  try {
    const setStatusFn = httpsCallable<typeof payload, { categoryId: string; isActive: boolean }>(functions, 'setAdminCategoryStatus');
    await setStatusFn(payload);
    return;
  } catch (fnErr: any) {
    throw new Error(fnErr.message || 'Failed to update category status');
  }
}

/**
 * Authoritatively deletes a category via Express API or Cloud Function.
 * Rejects deletion if any catalog products reference this category.
 */
export async function deleteCategory(id: string): Promise<void> {
  const payload = { categoryId: id };

  // 1. Primary: Express Backend API
  const adminBackendUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_ADMIN_API_URL;
  if (adminBackendUrl) {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${adminBackendUrl.replace(/\/$/, '')}/api/admin/categories/${id}`, {
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
      console.warn('Express delete category failed, checking Cloud Function fallback:', apiErr);
    }
  }

  // 2. Secondary: Cloud Function Fallback
  try {
    const deleteFn = httpsCallable<typeof payload, { categoryId: string; success: boolean }>(functions, 'deleteAdminCategory');
    await deleteFn(payload);
    return;
  } catch (fnErr: any) {
    throw new Error(fnErr.message || 'Failed to delete category');
  }
}
