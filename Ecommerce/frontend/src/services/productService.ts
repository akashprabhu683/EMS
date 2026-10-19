import {
    collection,
    getDocs,
    getDoc,
    doc,
    query,
    where,
    type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Product } from '../types';
import { PRODUCTS } from '../data/products';

/**
 * Convert a Firestore document into a typed Product.
 *
 * Image rules (stable, deterministic):
 *  1. Use the `images` array from Firestore (already validated https:// URLs).
 *  2. Fall back to `imageUrl` if images is empty.
 *  3. Always place the primary image at index 0; no random selection ever occurs.
 *
 * Price rules:
 *  Firestore stores prices in paise (₹449 → 44900). Divide by 100 to get INR.
 */
function toProduct(id: string, data: DocumentData): Product {
    const priceInPaise = Number(data.price);

    // Build a clean, ordered image list — no shuffling, no random selection
    let images: string[] = [];
    if (Array.isArray(data.images) && data.images.length > 0) {
        images = data.images.filter(
            (img: unknown): img is string =>
                typeof img === 'string' && img.startsWith('https://'),
        );
    }
    if (images.length === 0 && typeof data.imageUrl === 'string' && data.imageUrl.startsWith('https://')) {
        images = [data.imageUrl];
    }

    return {
        id,                                                          // stable Firestore doc ID (prod_*)
        name: String(data.name ?? ''),
        description: String(data.description ?? ''),
        price: priceInPaise / 100,
        originalPrice:
            typeof data.originalPrice === 'number'
                ? data.originalPrice / 100
                : undefined,
        images,                                                      // deterministic order, index 0 = primary
        category: String(data.category ?? data.categorySlug ?? data.categoryId ?? ''),
        rating: Number(data.rating ?? 0),
        reviewCount: Number(data.reviewCount ?? 0),
        stock: Math.max(0, Number(data.stock ?? 0)),
        tags: Array.isArray(data.tags) ? data.tags : [],
        featured: Boolean(data.featured),
        isNew: Boolean(data.isNew),
        discount:
            typeof data.discount === 'number' ? data.discount : undefined,
        colors: Array.isArray(data.colors) ? data.colors : undefined,
        sizes: Array.isArray(data.sizes) ? data.sizes : undefined,
        prepaidOnly: Boolean(data.prepaidOnly),
    };
}

/**
 * Deduplicate products by their stable document ID.
 * This guards against any future situation where Firestore contains
 * both auto-generated IDs and stable prod_* IDs for the same product.
 * Priority: stable prod_* IDs win over auto-generated IDs.
 */
function deduplicateByStableId(products: Product[]): Product[] {
    const map = new Map<string, Product>();

    // First pass: store all products keyed by id
    for (const p of products) {
        const existing = map.get(p.id);
        if (!existing) {
            map.set(p.id, p);
        } else {
            // Prefer the stable prod_* ID over an auto-generated one
            if (p.id.startsWith('prod_')) {
                map.set(p.id, p);
            }
        }
    }

    // Also detect name-based duplicates: if two docs have the same name,
    // keep only the one whose ID starts with 'prod_'
    const byName = new Map<string, Product>();
    for (const p of map.values()) {
        const nameKey = p.name.toLowerCase().trim();
        const existing = byName.get(nameKey);
        if (!existing) {
            byName.set(nameKey, p);
        } else {
            // Keep the one with the stable prod_* ID
            if (p.id.startsWith('prod_') && !existing.id.startsWith('prod_')) {
                byName.set(nameKey, p);
            }
        }
    }

    return Array.from(byName.values());
}

export async function getActiveProducts(): Promise<Product[]> {
    try {
        const productsQuery = query(
            collection(db, 'products'),
            where('isActive', '==', true),
        );

        const snapshot = await getDocs(productsQuery);
        const docs = snapshot.docs.map((document) =>
            toProduct(document.id, document.data()),
        );

        if (docs.length > 0) {
            // Deduplicate to prevent image instability from orphan docs
            return deduplicateByStableId(docs);
        }
    } catch (err) {
        console.warn('Could not fetch active products from Firestore, using catalog defaults:', err);
    }

    return PRODUCTS;
}

export async function getActiveProductById(
    productId: string,
): Promise<Product | null> {
    const cleanId = (productId || '').trim();
    if (!cleanId) return null;

    // Always look up by the exact stable document ID first
    try {
        const docRef = doc(db, 'products', cleanId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.isActive !== false) {
                return toProduct(docSnap.id, data);
            }
        }
    } catch {
        // Fallback to scanning active products
    }

    const products = await getActiveProducts();
    const found = products.find((product) =>
        product.id === cleanId ||
        product.id.toLowerCase() === cleanId.toLowerCase() ||
        (product as any).slug === cleanId
    );
    if (found) return found;

    // Final fallback to PRODUCTS catalog
    return PRODUCTS.find(p =>
        p.id === cleanId ||
        p.id.toLowerCase() === cleanId.toLowerCase() ||
        (p as any).slug === cleanId
    ) ?? null;
}

export async function getTrustedProducts(): Promise<Product[]> {
    return await getActiveProducts();
}

export async function getTrustedProductById(productId: string): Promise<Product | null> {
    return await getActiveProductById(productId);
}