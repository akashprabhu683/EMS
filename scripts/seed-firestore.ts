/**
 * Seed all 61 products and categories from products.ts into Firebase Firestore.
 * Run with: npx tsx scripts/seed-firestore.ts
 */

import { PRODUCTS, CATEGORIES } from '../Ecommerce/frontend/src/data/products';

const PROJECT_ID = 'ems-store-6a342';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function getAccessToken(): Promise<string> {
  const modPath = 'C:\\Users\\akash\\AppData\\Roaming\\npm\\node_modules\\firebase-tools';
  const auth = (await import('file:///' + (modPath + '\\lib\\auth.js').replace(/\\/g, '/'))).default || (await import('file:///' + (modPath + '\\lib\\auth.js').replace(/\\/g, '/')));
  const api = (await import('file:///' + (modPath + '\\lib\\api.js').replace(/\\/g, '/'))).default || (await import('file:///' + (modPath + '\\lib\\api.js').replace(/\\/g, '/')));
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error('No refresh token found in firebase-tools configuration.');
  }
  const token = await auth.getAccessToken(account.tokens.refresh_token, api.getScopes());
  if (!token?.access_token) {
    throw new Error('Failed to retrieve Google Cloud access token.');
  }
  return token.access_token;
}

// Convert JSON object into Firestore REST API value
function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: val.toString() };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(toFirestoreValue),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

async function main() {
  console.log('🌿 Connecting to Firebase Firestore...');
  const token = await getAccessToken();
  console.log('✅ Obtained Google Cloud access token.');

  // 1. Fetch existing categories from Firestore
  console.log('📂 Fetching existing categories...');
  const catRes = await fetch(`${FIRESTORE_BASE}/categories?pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const catData = await catRes.json();
  const existingCategories = catData.documents || [];
  console.log(`Found ${existingCategories.length} categories in Firestore.`);

  // Map category slug to firestore document ID
  const slugToIdMap = new Map<string, string>();
  for (const doc of existingCategories) {
    const docId = doc.name.split('/').pop()!;
    const slug = doc.fields?.slug?.stringValue;
    const name = doc.fields?.name?.stringValue;
    if (slug) {
      slugToIdMap.set(slug.toLowerCase(), docId);
      slugToIdMap.set(slug.toLowerCase().replace(/-/g, ''), docId);
      slugToIdMap.set(slug.toLowerCase().split('-')[0], docId);
    }
    if (name) {
      slugToIdMap.set(name.toLowerCase(), docId);
    }
  }

  // 2. Ensure the 6 core categories exist in Firestore
  console.log('🌱 Verifying categories...');
  for (const cat of CATEGORIES) {
    const matchedDocId = slugToIdMap.get(cat.id.toLowerCase());
    const now = new Date().toISOString();
    const catPayload = {
      fields: {
        name: { stringValue: cat.name },
        slug: { stringValue: cat.id },
        description: { stringValue: `${cat.name} herbal collection and formulations` },
        isActive: { booleanValue: true },
        updatedAt: { timestampValue: now },
      },
    };

    if (matchedDocId) {
      // Update
      await fetch(`${FIRESTORE_BASE}/categories/${matchedDocId}?updateMask.fieldPaths=isActive&updateMask.fieldPaths=name&updateMask.fieldPaths=slug`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(catPayload),
      });
      slugToIdMap.set(cat.id, matchedDocId);
    } else {
      // Create with specific ID
      const createRes = await fetch(`${FIRESTORE_BASE}/categories?documentId=${cat.id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...catPayload,
          fields: {
            ...catPayload.fields,
            createdAt: { timestampValue: now },
          },
        }),
      });
      const created = await createRes.json();
      const newId = created.name?.split('/').pop() || cat.id;
      slugToIdMap.set(cat.id, newId);
      console.log(`  Created category: ${cat.name} (${newId})`);
    }
  }

  // 3. Upload all products
  console.log(`📦 Seeding ${PRODUCTS.length} products to Firestore...`);
  let successCount = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < PRODUCTS.length; i++) {
    const prod = PRODUCTS[i];
    const categoryDocId = slugToIdMap.get(prod.category.toLowerCase()) || prod.category;

    // Price in paise for Firestore (₹449 -> 44900)
    const pricePaise = Math.round(prod.price * 100);
    const originalPricePaise = prod.originalPrice ? Math.round(prod.originalPrice * 100) : null;

    const fields: Record<string, any> = {
      name: { stringValue: prod.name },
      description: { stringValue: prod.description },
      categoryId: { stringValue: categoryDocId },
      category: { stringValue: prod.category },
      categorySlug: { stringValue: prod.category },
      price: { integerValue: pricePaise.toString() },
      stock: { integerValue: (prod.stock || 30).toString() },
      isActive: { booleanValue: true },
      rating: { doubleValue: Number(prod.rating || 4.5) },
      reviewCount: { integerValue: (prod.reviewCount || 100).toString() },
      imageUrl: { stringValue: prod.images[0] || '' },
      images: toFirestoreValue(prod.images),
      tags: toFirestoreValue(prod.tags || []),
      featured: { booleanValue: Boolean(prod.featured) },
      isNew: { booleanValue: Boolean(prod.isNew) },
      updatedAt: { timestampValue: now },
    };

    if (originalPricePaise) {
      fields.originalPrice = { integerValue: originalPricePaise.toString() };
    }
    if (prod.discount) {
      fields.discount = { integerValue: prod.discount.toString() };
    }

    const docUrl = `${FIRESTORE_BASE}/products/${prod.id}`;
    const res = await fetch(docUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    if (res.ok) {
      successCount++;
      process.stdout.write(`\r  [${i + 1}/${PRODUCTS.length}] Uploaded: ${prod.name.slice(0, 35)}...`);
    } else {
      const err = await res.text();
      console.error(`\n❌ Failed to upload ${prod.id}:`, err);
    }
  }

  console.log(`\n\n🎉 Successfully uploaded ${successCount}/${PRODUCTS.length} products to Firestore!`);
  console.log('All categories and product documents are now synced with active status.');
}

main().catch(err => {
  console.error('Fatal error during seed:', err);
  process.exit(1);
});
