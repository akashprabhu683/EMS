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

function toProduct(id: string, data: DocumentData): Product {
    const priceInPaise = Number(data.price);

    return {
        id,
        name: String(data.name ?? ''),
        description: String(data.description ?? ''),
        // Firestore stores INR in paise; storefront currently displays INR-like
        // prices as whole currency units.
        price: priceInPaise / 100,
        originalPrice:
            typeof data.originalPrice === 'number'
                ? data.originalPrice / 100
                : undefined,
        images:
            Array.isArray(data.images) && data.images.length > 0
                ? data.images.filter((image: unknown): image is string =>
                    typeof image === 'string' && image.startsWith('https://'),
                )
                : data.imageUrl?.startsWith('https://')
                    ? [data.imageUrl]
                    : [],
        category: String(data.categoryId ?? data.category ?? ''),
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

export async function getActiveProducts(): Promise<Product[]> {
    const productsQuery = query(
        collection(db, 'products'),
        where('isActive', '==', true),
    );

    const snapshot = await getDocs(productsQuery);

    return snapshot.docs.map((document) =>
        toProduct(document.id, document.data()),
    );
}

export async function getActiveProductById(
    productId: string,
): Promise<Product | null> {
    try {
        const docRef = doc(db, 'products', productId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.isActive === true) {
                return toProduct(docSnap.id, data);
            }
        }
    } catch {
        // Fallback to active products search
    }

    const products = await getActiveProducts();
    return products.find((product) => product.id === productId) ?? null;
}

export async function getTrustedProducts(): Promise<Product[]> {
    try {
        const remote = await getActiveProducts();
        if (remote.length > 0) {
            return remote;
        }
    } catch (err) {
        console.warn('Falling back to static products:', err);
    }
    return PRODUCTS;
}

export async function getTrustedProductById(productId: string): Promise<Product | null> {
    try {
        const remote = await getActiveProductById(productId);
        if (remote) return remote;
    } catch (err) {
        console.warn('Error fetching product from Firestore, checking fallback catalog:', err);
    }
    return PRODUCTS.find(p => p.id === productId) ?? null;
}