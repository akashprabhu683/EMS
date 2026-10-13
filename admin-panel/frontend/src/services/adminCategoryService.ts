import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  orderBy,
  limit,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
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

  // If editing existing category and matched doc is itself, it's allowed
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

export async function createCategory(form: CategoryFormData): Promise<string> {
  const validationError = validateCategoryForm(form);
  if (validationError) {
    throw new Error(validationError);
  }

  const cleanSlug = form.slug.trim().toLowerCase();
  const isAvailable = await checkSlugAvailable(cleanSlug);
  if (!isAvailable) {
    throw new Error(`The slug "${cleanSlug}" is already in use by another category. Please choose a unique slug.`);
  }

  const payload: Record<string, any> = {
    name: form.name.trim(),
    slug: cleanSlug,
    isActive: Boolean(form.isActive),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (form.description.trim()) {
    payload.description = form.description.trim();
  }

  const docRef = await addDoc(collection(db, 'categories'), payload);
  return docRef.id;
}

export async function updateCategory(id: string, form: CategoryFormData): Promise<void> {
  const validationError = validateCategoryForm(form);
  if (validationError) {
    throw new Error(validationError);
  }

  const cleanSlug = form.slug.trim().toLowerCase();
  const isAvailable = await checkSlugAvailable(cleanSlug, id);
  if (!isAvailable) {
    throw new Error(`The slug "${cleanSlug}" is already in use by another category. Please choose a unique slug.`);
  }

  const payload: Record<string, any> = {
    name: form.name.trim(),
    slug: cleanSlug,
    isActive: Boolean(form.isActive),
    updatedAt: serverTimestamp(),
  };

  if (form.description.trim()) {
    payload.description = form.description.trim();
  } else {
    payload.description = '';
  }

  await updateDoc(doc(db, 'categories', id), payload);
}

export async function setCategoryActiveStatus(id: string, isActive: boolean): Promise<void> {
  const docRef = doc(db, 'categories', id);
  await updateDoc(docRef, {
    isActive,
    updatedAt: serverTimestamp(),
  });
}
