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

const CATEGORY_META: Record<string, { icon: string; color: string }> = {
  'ayurvedic':       { icon: '🌿', color: '#059669' },
  'herbal-extracts': { icon: '🍃', color: '#10b981' },
  'vitality':        { icon: '⚡', color: '#f59e0b' },
  'digestive':       { icon: '🫁', color: '#0d9488' },
  'joint-care':      { icon: '🌱', color: '#8b5cf6' },
  'wellness-teas':   { icon: '🍵', color: '#e11d48' },
};

function docToCategory(id: string, data: DocumentData): Category {
  const slug = String(data.slug ?? id);
  const meta = CATEGORY_META[slug] || { icon: '🌿', color: '#059669' };
  return {
    id: slug,
    name: String(data.name ?? slug),
    icon: String(data.icon ?? meta.icon),
    count: 0,
    color: meta.color,
  };
}

export async function getActiveCategories(): Promise<Category[]> {
  try {
    const q = query(
      collection(db, 'categories'),
      where('isActive', '==', true)
    );
    const snap = await getDocs(q);
    const map = new Map<string, Category>();
    for (const d of snap.docs) {
      const cat = docToCategory(d.id, d.data());
      if (!map.has(cat.id)) {
        map.set(cat.id, cat);
      }
    }
    return Array.from(map.values());
  } catch (err) {
    console.warn('Failed to load categories from Firestore:', err);
    return [];
  }
}
