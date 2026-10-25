import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCTS_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/data/products.ts');

function loadProductsFromSource() {
  const content = fs.readFileSync(PRODUCTS_PATH, 'utf8');

  // Match only products inside PRODUCTS array whose id starts with 'prod_'
  const productBlocks = content.split(/\{\s*id:\s*'/).slice(1);
  const products = [];

  for (const block of productBlocks) {
    const idMatch = block.match(/^([^']+)'/);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (!id.startsWith('prod_')) continue;

    const nameMatch = block.match(/name:\s*'([^']+)'/);
    const name = nameMatch ? nameMatch[1] : '';

    const priceMatch = block.match(/price:\s*(\d+)/);
    const price = priceMatch ? Number(priceMatch[1]) : 0;

    const categoryMatch = block.match(/category:\s*'([^']+)'/);
    const category = categoryMatch ? categoryMatch[1] : '';

    const imagesMatch = block.match(/images:\s*\[([\s\S]*?)\]/);
    const images = [];
    if (imagesMatch) {
      const urlMatches = imagesMatch[1].match(/'(https:\/\/[^']+)'/g);
      if (urlMatches) {
        for (const u of urlMatches) {
          images.push(u.replace(/'/g, ''));
        }
      }
    }

    products.push({ id, name, price, category, images });
  }

  return products;
}

test('Catalog 1: Black Seed (Kalonji) Oil exists and has correct botanical amber dropper image', () => {
  const products = loadProductsFromSource();
  const blackSeedOil = products.find((p) => p.id === 'prod_black_seed_oil');
  assert.ok(blackSeedOil, 'Product prod_black_seed_oil must exist in the catalog');
  assert.match(blackSeedOil.name, /Black Seed.*Kalonji.*Oil/i, 'Name must reference Black Seed Kalonji Oil');
  assert.ok(Array.isArray(blackSeedOil.images) && blackSeedOil.images.length > 0, 'Must have at least one image');

  const primaryImage = blackSeedOil.images[0];
  assert.ok(primaryImage.startsWith('https://'), 'Primary image must be a secure HTTPS URL');
  // Specifically verify the authentic botanical amber dropper image
  assert.equal(
    primaryImage,
    'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&q=80',
    'Primary image must match the verified botanical amber dropper bottle, not cosmetic tube or unrelated placeholder'
  );
  assert.equal(blackSeedOil.category, 'herbal-extracts');
  assert.equal(blackSeedOil.price, 449);
});

test('Catalog 2: All catalog products have unique IDs, valid prices, and secure HTTPS images', () => {
  const products = loadProductsFromSource();
  const seenIds = new Set();

  for (const product of products) {
    assert.ok(product.id, 'Product ID must be defined');
    assert.ok(!seenIds.has(product.id), `Duplicate product ID detected: ${product.id}`);
    seenIds.add(product.id);

    assert.ok(product.name && product.name.trim().length > 0, `Product ${product.id} must have a name`);
    assert.ok(typeof product.price === 'number' && product.price > 0, `Product ${product.id} price must be > 0`);
    assert.ok(product.category && product.category.trim().length > 0, `Product ${product.id} must have a category`);

    assert.ok(Array.isArray(product.images) && product.images.length > 0, `Product ${product.id} must have images`);
    for (const img of product.images) {
      assert.ok(img.startsWith('https://'), `Product ${product.id} image must be HTTPS URL: ${img}`);
      assert.doesNotMatch(img, /undefined|null|placeholder/i, `Image URL must not contain undefined or placeholder: ${img}`);
    }
  }

  assert.ok(seenIds.size >= 60, `Catalog must have at least 60 active products (found ${seenIds.size})`);
});
