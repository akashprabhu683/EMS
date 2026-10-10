import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
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
  // Avoid floating-point issues by rounding to nearest integer in paise
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

  if (form.imageUrl.trim() && !form.imageUrl.trim().startsWith('https://')) {
    return 'Image URL must be a secure HTTPS link (https://...).';
  }

  return null;
}

export async function getAllProducts(): Promise<Product[]> {
  const productsQuery = query(
    collection(db, 'products'),
    orderBy('createdAt', 'desc')
  );

  try {
    const snapshot = await getDocs(productsQuery);
    return snapshot.docs.map(docSnap => docToProduct(docSnap.id, docSnap.data()));
  } catch (err) {
    // If orderBy createdAt index is building or missing, fallback to unordered query
    const fallbackSnap = await getDocs(collection(db, 'products'));
    return fallbackSnap.docs.map(docSnap => docToProduct(docSnap.id, docSnap.data()));
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  const docRef = doc(db, 'products', id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return docToProduct(snap.id, snap.data());
}

export async function createProduct(form: ProductFormData): Promise<string> {
  const validationError = validateProductForm(form);
  if (validationError) {
    throw new Error(validationError);
  }

  const priceInPaise = rupeesToPaise(form.priceRupees);
  const stock = parseInt(form.stock, 10);

  const payload: Record<string, any> = {
    name: form.name.trim(),
    description: form.description.trim(),
    categoryId: form.categoryId.trim(),
    price: priceInPaise,
    stock,
    isActive: Boolean(form.isActive),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (form.imageUrl.trim()) {
    payload.imageUrl = form.imageUrl.trim();
  }

  const docRef = await addDoc(collection(db, 'products'), payload);
  return docRef.id;
}

export async function updateProduct(id: string, form: ProductFormData): Promise<void> {
  const validationError = validateProductForm(form);
  if (validationError) {
    throw new Error(validationError);
  }

  const priceInPaise = rupeesToPaise(form.priceRupees);
  const stock = parseInt(form.stock, 10);

  const docRef = doc(db, 'products', id);
  const payload: Record<string, any> = {
    name: form.name.trim(),
    description: form.description.trim(),
    categoryId: form.categoryId.trim(),
    price: priceInPaise,
    stock,
    isActive: Boolean(form.isActive),
    updatedAt: serverTimestamp(),
  };

  if (form.imageUrl.trim()) {
    payload.imageUrl = form.imageUrl.trim();
  } else {
    payload.imageUrl = '';
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
