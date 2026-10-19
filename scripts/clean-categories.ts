/**
 * Clean up categories in Firestore:
 * 1. Remove all irrelevant non-herbal categories (electronics, fashion, books, etc.)
 * 2. Remove orphan/duplicate auto-ID category documents
 * 3. Ensure the 6 canonical categories exist with clean document IDs matching their slugs
 */

import { CATEGORIES } from '../Ecommerce/frontend/src/data/products';

const PROJECT_ID = 'ems-store-6a342';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function getAccessToken(): Promise<string> {
  const modPath = 'C:\\Users\\akash\\AppData\\Roaming\\npm\\node_modules\\firebase-tools';
  const authMod = (await import('file:///' + (modPath + '\\lib\\auth.js').replace(/\\/g, '/'))).default || (await import('file:///' + (modPath + '\\lib\\auth.js').replace(/\\/g, '/')));
  const apiMod = (await import('file:///' + (modPath + '\\lib\\api.js').replace(/\\/g, '/'))).default || (await import('file:///' + (modPath + '\\lib\\api.js').replace(/\\/g, '/')));
  const account = authMod.getGlobalDefaultAccount();
  const token = await authMod.getAccessToken(account.tokens.refresh_token, apiMod.getScopes());
  return token.access_token;
}

async function cleanCategories() {
  const token = await getAccessToken();
  console.log('Fetching all categories from Firestore...');

  const res = await fetch(`${FIRESTORE_BASE}/categories?pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const docs = data.documents || [];
  console.log(`Found ${docs.length} category documents.`);

  const canonicalSlugs = new Set(CATEGORIES.map(c => c.id)); // ['ayurvedic', 'herbal-extracts', 'vitality', 'digestive', 'joint-care', 'wellness-teas']

  // 1. Delete all non-canonical docs
  for (const doc of docs) {
    const docId = doc.name.split('/').pop()!;
    if (!canonicalSlugs.has(docId)) {
      console.log(`Deleting non-canonical / duplicate category doc: ${docId}`);
      await fetch(`${FIRESTORE_BASE}/categories/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }

  // 2. Ensure each canonical category exists with correct slug & name
  const now = new Date().toISOString();
  for (const cat of CATEGORIES) {
    console.log(`Setting canonical category: ${cat.id} (${cat.name})`);
    const payload = {
      fields: {
        name: { stringValue: cat.name },
        slug: { stringValue: cat.id },
        description: { stringValue: `${cat.name} authentic herbal collection` },
        isActive: { booleanValue: true },
        icon: { stringValue: cat.icon || '🌿' },
        updatedAt: { timestampValue: now },
      },
    };

    await fetch(`${FIRESTORE_BASE}/categories/${cat.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  console.log('✅ Canonical categories cleaned and synced successfully!');
}

cleanCategories().catch(console.error);
