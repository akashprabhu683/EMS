import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Category } from '../types';

function docToCategory(id: string, data: DocumentData): Category {
  return {
    id,
    name: String(data.name ?? ''),
    icon: '📦',
    count: 0,
    color: '#3b82f6',
  };
}

export async function getActiveCategories(): Promise<Category[]> {
  try {
    const q = query(
      collection(db, 'categories'),
      where('isActive', '==', true)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => docToCategory(d.id, d.data()));
  } catch (err) {
    console.warn('Failed to load categories from Firestore:', err);
    return [];
  }
}
