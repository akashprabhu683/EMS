import type { Timestamp } from 'firebase/firestore';

export interface Product {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  // Stored in paise as an integer (e.g., 29900 for ₹299.00)
  price: number;
  imageUrl?: string;
  stock: number;
  isActive: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ProductFormData {
  name: string;
  description: string;
  categoryId: string;
  // Price in rupees entered by admin in form
  priceRupees: string;
  imageUrl: string;
  stock: string;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface CategoryFormData {
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
}

export interface AdminUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
}
