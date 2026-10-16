/**
 * Fix broken 404 images in products.ts and sync with Firestore.
 * Run with: npx tsx scripts/fix-broken-images.ts
 */

import fs from 'fs';
import path from 'path';

const REPLACEMENTS: Record<string, string> = {
  // Mahanarayan oil, Nirgundi oil, Dashamoola oil
  'https://images.unsplash.com/photo-1608248597359-5613398935c1?w=600&q=80': 'https://images.unsplash.com/photo-1556760544-74068565f05c?w=600&q=80',
  // Karela Jamun juice & Gokshura tablets
  'https://images.unsplash.com/photo-1559181567-c3190ca9d70d?w=600&q=80': 'https://images.unsplash.com/photo-1543362906-acfc16c67564?w=600&q=80',
  // Wheatgrass powder
  'https://images.unsplash.com/photo-1615485291234-9d694218aed4?w=600&q=80': 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&q=80',
  // Immunity gummies & Peppermint tea
  'https://images.unsplash.com/photo-1587049352851-8d4b89133611?w=600&q=80': 'https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?w=600&q=80',
  // Spirulina & Chlorella
  'https://images.unsplash.com/photo-1612543544697-ddeca618fb7f?w=600&q=80': 'https://images.unsplash.com/photo-1509358271058-acd22cc93898?w=600&q=80',
  // Herbal Probiotics
  'https://images.unsplash.com/photo-1611021061285-36c1f7e4b946?w=600&q=80': 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=600&q=80',
  // Arthritis relief balm
  'https://images.unsplash.com/photo-1583947581924-c4acf39f9dab?w=600&q=80': 'https://images.unsplash.com/photo-1617897903246-719242758050?w=600&q=80',
  // Rasna Saptak tablets
  'https://images.unsplash.com/photo-1474487548417-781cb6d646b3?w=600&q=80': 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&q=80',
};

// Also give Peppermint tea a distinct tea image
const PEPPERMINT_TEA_IMG = 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=600&q=80';
// And Gokshura a tablets image
const GOKSHURA_IMG = 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&q=80';

const PRODUCTS_FILE = path.resolve('Ecommerce/frontend/src/data/products.ts');

async function main() {
  console.log('🔄 Reading products.ts...');
  let content = fs.readFileSync(PRODUCTS_FILE, 'utf8');

  for (const [badUrl, goodUrl] of Object.entries(REPLACEMENTS)) {
    const regex = new RegExp(badUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    content = content.replace(regex, goodUrl);
  }

  // Refine specific products for perfect imagery
  content = content.replace(
    /(id:\s*'prod_peppermint_tea'[\s\S]*?images:\s*\[\s*')[^']+(')/,
    `$1${PEPPERMINT_TEA_IMG}$2`
  );
  content = content.replace(
    /(id:\s*'prod_gokshura_tablets'[\s\S]*?images:\s*\[\s*')[^']+(')/,
    `$1${GOKSHURA_IMG}$2`
  );

  fs.writeFileSync(PRODUCTS_FILE, content, 'utf8');
  console.log('✅ products.ts updated with valid herbal images.');

  // Now re-run seed-firestore.ts to sync Firestore
  console.log('🌿 Syncing Firestore with updated product images...');
  const { execSync } = await import('child_process');
  execSync('npx tsx scripts/seed-firestore.ts', { stdio: 'inherit' });
}

main().catch(console.error);
