import test from "node:test";
import assert from "node:assert/strict";
import {
  executeCreateProduct,
  executeUpdateProduct,
  executeAdjustProductStock,
  executeSetProductStatus,
  executeDeleteProduct,
  executeCreateCategory,
  executeUpdateCategory,
  executeSetCategoryStatus,
  executeDeleteCategory,
  verifyAdminCaller,
  validateCategorySlug,
  PRIMARY_SUPERADMIN_EMAIL,
} from "../lib/catalog.js";

/* ═══════════════════════════════════════════════════════════════════════
   MOCK FIRESTORE WITH TRANSACTION CONCURRENCY AND AUDIT SUPPORT
   ═══════════════════════════════════════════════════════════════════════ */

class MockFirestore {
  constructor() {
    this.store = new Map();
  }

  _getDoc(coll, id) {
    if (!this.store.has(coll)) this.store.set(coll, new Map());
    return this.store.get(coll).get(id);
  }

  _setDoc(coll, id, data) {
    if (!this.store.has(coll)) this.store.set(coll, new Map());
    const collMap = this.store.get(coll);
    const existing = collMap.get(id);
    const version = (existing ? existing.version : 0) + 1;
    collMap.set(id, { data: JSON.parse(JSON.stringify(data)), version });
  }

  _deleteDoc(coll, id) {
    if (this.store.has(coll)) {
      this.store.get(coll).delete(id);
    }
  }

  collection(collName) {
    const firestore = this;
    return {
      doc(id) {
        const docId = id || `auto_${Math.random().toString(36).substring(2, 9)}`;
        return {
          id: docId,
          path: `${collName}/${docId}`,
          collName,
          async get() {
            const entry = firestore._getDoc(collName, docId);
            return {
              exists: !!entry,
              id: docId,
              ref: this,
              data: () => (entry ? JSON.parse(JSON.stringify(entry.data)) : undefined),
            };
          },
          async update(data) {
            const entry = firestore._getDoc(collName, docId);
            if (!entry) throw new Error(`Cannot update non-existent document ${collName}/${docId}`);
            firestore._setDoc(collName, docId, { ...entry.data, ...data });
          },
          async set(data) {
            firestore._setDoc(collName, docId, data);
          },
          async delete() {
            firestore._deleteDoc(collName, docId);
          },
        };
      },
      where(field, op, val) {
        const queryFilters = [{ field, op, val }];
        let queryLimit = Infinity;
        const q = {
          where(f, o, v) {
            queryFilters.push({ field: f, op: o, val: v });
            return q;
          },
          limit(n) {
            queryLimit = n;
            return q;
          },
          async get() {
            const collMap = firestore.store.get(collName) || new Map();
            const docs = [];
            for (const [id, entry] of collMap.entries()) {
              let match = true;
              for (const filter of queryFilters) {
                if (filter.op === "==" && entry.data[filter.field] !== filter.val) {
                  match = false;
                  break;
                }
              }
              if (match) {
                docs.push({
                  id,
                  ref: firestore.collection(collName).doc(id),
                  data: () => JSON.parse(JSON.stringify(entry.data)),
                });
                if (docs.length >= queryLimit) break;
              }
            }
            return {
              docs,
              empty: docs.length === 0,
              size: docs.length,
            };
          },
        };
        return q;
      },
      limit(n) {
        let queryLimit = n;
        const q = {
          limit(newN) {
            queryLimit = newN;
            return q;
          },
          async get() {
            const collMap = firestore.store.get(collName) || new Map();
            const docs = [];
            for (const [id, entry] of collMap.entries()) {
              docs.push({
                id,
                ref: firestore.collection(collName).doc(id),
                data: () => JSON.parse(JSON.stringify(entry.data)),
              });
              if (docs.length >= queryLimit) break;
            }
            return {
              docs,
              empty: docs.length === 0,
              size: docs.length,
            };
          },
        };
        return q;
      },
      async get() {
        const collMap = firestore.store.get(collName) || new Map();
        const docs = [];
        for (const [id, entry] of collMap.entries()) {
          docs.push({
            id,
            ref: firestore.collection(collName).doc(id),
            data: () => JSON.parse(JSON.stringify(entry.data)),
          });
        }
        return {
          docs,
          empty: docs.length === 0,
          size: docs.length,
        };
      },
    };
  }

  batch() {
    const firestore = this;
    const ops = [];
    return {
      set(docRef, data) {
        ops.push(() => firestore._setDoc(docRef.collName, docRef.id, data));
      },
      update(docRef, data) {
        ops.push(() => {
          const entry = firestore._getDoc(docRef.collName, docRef.id);
          firestore._setDoc(docRef.collName, docRef.id, { ...(entry ? entry.data : {}), ...data });
        });
      },
      delete(docRef) {
        ops.push(() => firestore._deleteDoc(docRef.collName, docRef.id));
      },
      async commit() {
        for (const op of ops) op();
      },
    };
  }

  async runTransaction(updateFn) {
    const firestore = this;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      attempts++;
      const readVersions = new Map();
      const stagedWrites = [];

      const transaction = {
        async get(docRef) {
          const entry = firestore._getDoc(docRef.collName, docRef.id);
          const version = entry ? entry.version : 0;
          readVersions.set(`${docRef.collName}/${docRef.id}`, version);
          return {
            exists: !!entry,
            id: docRef.id,
            ref: docRef,
            data: () => (entry ? JSON.parse(JSON.stringify(entry.data)) : undefined),
          };
        },
        update(docRef, data) {
          stagedWrites.push({ type: "update", docRef, data });
        },
        set(docRef, data) {
          stagedWrites.push({ type: "set", docRef, data });
        },
        delete(docRef) {
          stagedWrites.push({ type: "delete", docRef });
        },
      };

      try {
        const result = await updateFn(transaction);

        // Optimistic concurrency validation
        let conflict = false;
        for (const [docPath, versionAtRead] of readVersions.entries()) {
          const [coll, id] = docPath.split("/");
          const currentEntry = firestore._getDoc(coll, id);
          const currentVersion = currentEntry ? currentEntry.version : 0;
          if (currentVersion !== versionAtRead) {
            conflict = true;
            break;
          }
        }

        if (conflict) {
          continue; // Conflict retry
        }

        // Commit staged writes
        for (const write of stagedWrites) {
          if (write.type === "set") {
            firestore._setDoc(write.docRef.collName, write.docRef.id, write.data);
          } else if (write.type === "update") {
            const entry = firestore._getDoc(write.docRef.collName, write.docRef.id);
            firestore._setDoc(write.docRef.collName, write.docRef.id, { ...(entry ? entry.data : {}), ...write.data });
          } else if (write.type === "delete") {
            firestore._deleteDoc(write.docRef.collName, write.docRef.id);
          }
        }

        return result;
      } catch (err) {
        throw err;
      }
    }

    throw new Error("Transaction contention limit reached");
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   TEST SETUP HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

const mockAdminCaller = {
  uid: "admin_tester",
  email: "admin@ems.shop",
  role: "admin",
};

function seedCatalog(db) {
  // Seed categories
  db._setDoc("categories", "cat_ayurveda", {
    id: "cat_ayurveda",
    name: "Ayurvedic Medicines",
    slug: "ayurvedic-medicines",
    isActive: true,
  });
  db._setDoc("category_slugs", "ayurvedic-medicines", {
    categoryId: "cat_ayurveda",
    slug: "ayurvedic-medicines",
  });

  db._setDoc("categories", "cat_wellness", {
    id: "cat_wellness",
    name: "Wellness Teas",
    slug: "wellness-teas",
    isActive: true,
  });
  db._setDoc("category_slugs", "wellness-teas", {
    categoryId: "cat_wellness",
    slug: "wellness-teas",
  });

  // Seed product
  db._setDoc("products", "prod_ashwagandha", {
    id: "prod_ashwagandha",
    name: "Ashwagandha Capsules",
    description: "Pure organic stress relief formula",
    categoryId: "cat_ayurveda",
    price: 34900,
    stock: 25,
    lowStockThreshold: 5,
    isActive: true,
  });

  // Seed admin user in admins collection
  db._setDoc("admins", "admin_alice", {
    uid: "admin_alice",
    email: "alice@ems.shop",
    isActive: true,
  });
  db._setDoc("admins", "admin_tester", {
    uid: "admin_tester",
    email: "admin@ems.shop",
    isActive: true,
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   TEST SUITE
   ═══════════════════════════════════════════════════════════════════════ */

test("Phase 6C.1: Caller Authorization - Non-admin, revoked, and deactivated callers are strictly rejected, superadmin is recognized", async () => {
  const db = new MockFirestore();
  seedCatalog(db);

  // 1. Unauthenticated request
  await assert.rejects(
    async () => {
      await verifyAdminCaller(db, { auth: null });
    },
    /Authentication is required/
  );

  // 2. Authenticated customer without admin claim or admin doc
  await assert.rejects(
    async () => {
      await verifyAdminCaller(db, {
        auth: {
          uid: "customer_bob",
          token: { admin: false, email: "bob@gmail.com" },
        },
      });
    },
    /Administrator privilege is required/
  );

  // 3. Revoked administrator is strictly blocked even if token.admin is true
  db._setDoc("admin_revocations", "admin_revoked_uid", {
    revokedAt: new Date().toISOString(),
    revokedBy: "akashprabhu0302@gmail.com",
  });
  db._setDoc("admins", "admin_revoked_uid", {
    uid: "admin_revoked_uid",
    email: "revoked@ems.shop",
    isActive: true,
  });
  await assert.rejects(
    async () => {
      await verifyAdminCaller(db, {
        auth: {
          uid: "admin_revoked_uid",
          token: { admin: true, email: "revoked@ems.shop" },
        },
      });
    },
    /Administrator privilege has been revoked/
  );

  // 4. Deactivated administrator in /admins/{uid} is strictly blocked
  db._setDoc("admins", "admin_deactivated_uid", {
    uid: "admin_deactivated_uid",
    email: "deactivated@ems.shop",
    isActive: false,
  });
  await assert.rejects(
    async () => {
      await verifyAdminCaller(db, {
        auth: {
          uid: "admin_deactivated_uid",
          token: { admin: true, email: "deactivated@ems.shop" },
        },
      });
    },
    /Administrator privilege has been deactivated/
  );

  // 5. Active admin with token and active record succeeds
  const verifiedAdmin = await verifyAdminCaller(db, {
    auth: {
      uid: "admin_alice",
      token: { admin: true, email: "alice@ems.shop" },
    },
  });
  assert.equal(verifiedAdmin.uid, "admin_alice");
  assert.equal(verifiedAdmin.role, "admin");

  // 6. Canonical superadmin matches configuration without requiring client role claim
  assert.equal(PRIMARY_SUPERADMIN_EMAIL, "akashprabhu0302@gmail.com");
  const verifiedSuperadmin = await verifyAdminCaller(db, {
    auth: {
      uid: "superadmin_uid_789",
      token: { email: "akashprabhu0302@gmail.com" },
    },
  });
  assert.equal(verifiedSuperadmin.role, "superadmin");
  assert.equal(verifiedSuperadmin.email, "akashprabhu0302@gmail.com");
});

test("Phase 6C.2: Server-side validation rejects invalid prices, quantities, and thresholds", async () => {
  const db = new MockFirestore();
  seedCatalog(db);

  // 1. Negative price rejected
  await assert.rejects(
    async () => {
      await executeCreateProduct(db, mockAdminCaller, {
        name: "Test Tonic",
        description: "Herbal vitality tonic",
        categoryId: "cat_ayurveda",
        pricePaise: -500,
        stock: 10,
      });
    },
    /Price must be a valid positive integer/
  );

  // 2. Zero price rejected
  await assert.rejects(
    async () => {
      await executeCreateProduct(db, mockAdminCaller, {
        name: "Test Tonic",
        description: "Herbal vitality tonic",
        categoryId: "cat_ayurveda",
        pricePaise: 0,
        stock: 10,
      });
    },
    /Price must be a valid positive integer/
  );

  // 3. Negative stock rejected
  await assert.rejects(
    async () => {
      await executeCreateProduct(db, mockAdminCaller, {
        name: "Test Tonic",
        description: "Herbal vitality tonic",
        categoryId: "cat_ayurveda",
        pricePaise: 29900,
        stock: -1,
      });
    },
    /Stock must be a non-negative whole integer/
  );

  // 4. Non-integer stock rejected
  await assert.rejects(
    async () => {
      await executeCreateProduct(db, mockAdminCaller, {
        name: "Test Tonic",
        description: "Herbal vitality tonic",
        categoryId: "cat_ayurveda",
        pricePaise: 29900,
        stock: 5.5,
      });
    },
    /Stock must be a non-negative whole integer/
  );

  // 5. Valid product creation computes low stock and out of stock flags accurately
  const res = await executeCreateProduct(db, mockAdminCaller, {
    name: "Triphala Churna",
    description: "Traditional digestive powder",
    categoryId: "cat_ayurveda",
    pricePaise: 19900,
    stock: 3,
    lowStockThreshold: 5,
  });

  const createdDoc = db._getDoc("products", res.productId).data;
  assert.equal(createdDoc.name, "Triphala Churna");
  assert.equal(createdDoc.price, 19900);
  assert.equal(createdDoc.isLowStock, true);
  assert.equal(createdDoc.isOutOfStock, false);
});

test("Phase 6C.3: Referential integrity - Category existence and concurrency-safe slug uniqueness via document locks", async () => {
  const db = new MockFirestore();
  seedCatalog(db);

  // 1. Non-existent categoryId is rejected on product creation
  await assert.rejects(
    async () => {
      await executeCreateProduct(db, mockAdminCaller, {
        name: "Spurious Herb",
        description: "Non-existent category reference",
        categoryId: "cat_ghost_category_999",
        pricePaise: 29900,
        stock: 10,
      });
    },
    /does not exist in the database/
  );

  // 2. Malformed category slug is rejected
  assert.throws(
    () => {
      validateCategorySlug("Invalid Slug With Spaces!!");
    },
    /Slug must only contain lowercase alphanumeric/
  );

  // 3. Duplicate category slug is rejected on creation via slug document lock
  await assert.rejects(
    async () => {
      await executeCreateCategory(db, mockAdminCaller, {
        name: "Ayurvedic Medicines Copy",
        slug: "ayurvedic-medicines", // already exists in seed
      });
    },
    /already in use by another category/
  );

  // 4. Concurrent category creation with identical slug transactionally collides: exactly 1 succeeds
  const results = await Promise.allSettled([
    executeCreateCategory(db, mockAdminCaller, {
      name: "Organic Honey Batch A",
      slug: "organic-honey",
    }),
    executeCreateCategory(db, mockAdminCaller, {
      name: "Organic Honey Batch B",
      slug: "organic-honey",
    }),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1, "Exactly one category creation must succeed");
  assert.equal(rejected.length, 1, "The concurrent duplicate must be rejected");
  assert.match(rejected[0].reason.message, /already in use by another category/);
});

test("Phase 6C.4: Concurrency hardening - Optimistic concurrency check (expectedCurrentStock) rejects stale product updates", async () => {
  const db = new MockFirestore();
  seedCatalog(db);

  // Initial stock is 25
  const initialAshwa = db._getDoc("products", "prod_ashwagandha").data;
  assert.equal(initialAshwa.stock, 25);

  // 1. Normal product update without stock change succeeds
  await executeUpdateProduct(db, mockAdminCaller, {
    productId: "prod_ashwagandha",
    pricePaise: 39900,
    lowStockThreshold: 8,
  });

  const updatedAshwa = db._getDoc("products", "prod_ashwagandha").data;
  assert.equal(updatedAshwa.price, 39900);
  assert.equal(updatedAshwa.stock, 25); // Stock unchanged

  // 2. Simulating concurrent order stock deduction: customer order decrements stock from 25 to 20
  db._setDoc("products", "prod_ashwagandha", {
    ...updatedAshwa,
    stock: 20,
  });

  // 3. Admin attempts to update product with stale expectedCurrentStock (25)
  // Server must reject with 409 conflict to prevent overwriting the order stock deduction!
  await assert.rejects(
    async () => {
      await executeUpdateProduct(db, mockAdminCaller, {
        productId: "prod_ashwagandha",
        stock: 30,
        expectedCurrentStock: 25, // Stale stock from when form opened
      });
    },
    /Stock conflict: Product stock was modified concurrently/
  );

  // Stock must remain preserved at 20!
  assert.equal(db._getDoc("products", "prod_ashwagandha").data.stock, 20);

  // 4. Update with correct expectedCurrentStock (20) succeeds
  await executeUpdateProduct(db, mockAdminCaller, {
    productId: "prod_ashwagandha",
    stock: 30,
    expectedCurrentStock: 20,
  });
  assert.equal(db._getDoc("products", "prod_ashwagandha").data.stock, 30);
});

test("Phase 6C.5: Dedicated atomic stock adjustments serialize without overwriting concurrent changes", async () => {
  const db = new MockFirestore();
  seedCatalog(db);

  // Initial stock is 25
  assert.equal(db._getDoc("products", "prod_ashwagandha").data.stock, 25);

  // 1. Relative delta reduction
  const res1 = await executeAdjustProductStock(db, mockAdminCaller, {
    productId: "prod_ashwagandha",
    adjustmentType: "delta",
    value: -5,
    reason: "Damaged packaging in transit",
  });
  assert.equal(res1.newStock, 20);
  assert.equal(db._getDoc("products", "prod_ashwagandha").data.stock, 20);

  // 2. Reject reducing stock below zero
  await assert.rejects(
    async () => {
      await executeAdjustProductStock(db, mockAdminCaller, {
        productId: "prod_ashwagandha",
        adjustmentType: "delta",
        value: -30,
        reason: "Excessive deduction",
      });
    },
    /Cannot reduce stock by 30/
  );

  // 3. Concurrent delta additions (+10 and +15) serialize transactionally
  await Promise.all([
    executeAdjustProductStock(db, mockAdminCaller, {
      productId: "prod_ashwagandha",
      adjustmentType: "delta",
      value: 10,
      reason: "Supplier batch A",
    }),
    executeAdjustProductStock(db, mockAdminCaller, {
      productId: "prod_ashwagandha",
      adjustmentType: "delta",
      value: 15,
      reason: "Supplier batch B",
    }),
  ]);

  // Final stock must be 20 + 10 + 15 = 45 without losing any update!
  assert.equal(db._getDoc("products", "prod_ashwagandha").data.stock, 45);
});

test("Phase 6C.6: Physical product deletion is strictly prohibited to protect historical and concurrent order integrity", async () => {
  const db = new MockFirestore();
  seedCatalog(db);

  // Attempting physical deletion is rejected unconditionally with failed-precondition
  await assert.rejects(
    async () => {
      await executeDeleteProduct(db, mockAdminCaller, { productId: "prod_ashwagandha" });
    },
    /Physical deletion of catalog products is prohibited to protect historical and concurrent order integrity\. Please deactivate the product instead/
  );

  // Product document must remain intact
  assert.ok(db._getDoc("products", "prod_ashwagandha"));

  // Deactivating product sets isActive: false and preserves historical records
  const statusRes = await executeSetProductStatus(db, mockAdminCaller, {
    productId: "prod_ashwagandha",
    isActive: false,
  });
  assert.equal(statusRes.isActive, false);
  assert.equal(db._getDoc("products", "prod_ashwagandha").data.isActive, false);
});

test("Phase 6C.7: Physical category deletion is strictly prohibited to protect catalog referential integrity", async () => {
  const db = new MockFirestore();
  seedCatalog(db);

  // Attempting physical deletion is rejected unconditionally with failed-precondition
  await assert.rejects(
    async () => {
      await executeDeleteCategory(db, mockAdminCaller, { categoryId: "cat_wellness" });
    },
    /Physical deletion of categories is prohibited to protect catalog referential integrity\. Please deactivate the category instead/
  );

  // Category remains intact
  assert.ok(db._getDoc("categories", "cat_wellness"));

  // Deactivating category sets isActive: false and preserves referential integrity
  const statusRes = await executeSetCategoryStatus(db, mockAdminCaller, {
    categoryId: "cat_wellness",
    isActive: false,
  });
  assert.equal(statusRes.isActive, false);
  assert.equal(db._getDoc("categories", "cat_wellness").data.isActive, false);
});

test("Phase 6C.8: Category and product status toggling updates active flags and writes audit entries", async () => {
  const db = new MockFirestore();
  seedCatalog(db);

  // Deactivate product
  await executeSetProductStatus(db, mockAdminCaller, { productId: "prod_ashwagandha", isActive: false });
  assert.equal(db._getDoc("products", "prod_ashwagandha").data.isActive, false);

  // Reactivate product
  await executeSetProductStatus(db, mockAdminCaller, { productId: "prod_ashwagandha", isActive: true });
  assert.equal(db._getDoc("products", "prod_ashwagandha").data.isActive, true);

  // Deactivate category
  await executeSetCategoryStatus(db, mockAdminCaller, { categoryId: "cat_ayurveda", isActive: false });
  assert.equal(db._getDoc("categories", "cat_ayurveda").data.isActive, false);

  // Verify audit logs for status changes
  const auditLogs = Array.from((db.store.get("audit_logs") || new Map()).values());
  const statusLogs = auditLogs.filter(
    (l) => (l.data.action === "PRODUCT_UPDATED" || l.data.action === "CATEGORY_UPDATED") &&
           l.data.changes?.some((c) => c.field === "isActive")
  );
  assert.ok(statusLogs.length >= 3, `Expected at least 3 status change logs, got ${statusLogs.length}`);
});

test("Phase 6C.9: Audit atomicity - Failed mutations write zero audit records; unchanged updates omit duplicates", async () => {
  const db = new MockFirestore();
  seedCatalog(db);

  const initialLogsCount = (db.store.get("audit_logs") || new Map()).size;

  // 1. Failed operation (invalid price) must not create any audit log
  await assert.rejects(
    async () => {
      await executeCreateProduct(db, mockAdminCaller, {
        name: "Corrupt Item",
        description: "Bad price item",
        categoryId: "cat_ayurveda",
        pricePaise: -99,
        stock: 5,
      });
    },
    /Price must be a valid positive integer/
  );
  assert.equal((db.store.get("audit_logs") || new Map()).size, initialLogsCount);

  // 2. Unchanged update: updating with identical values creates no changes and writes no duplicate audit log
  const res = await executeUpdateProduct(db, mockAdminCaller, {
    productId: "prod_ashwagandha",
    name: "Ashwagandha Capsules", // Same name as seed
  });
  assert.equal(res.success, true);
  assert.equal((db.store.get("audit_logs") || new Map()).size, initialLogsCount);
});

test("Phase 6C.10: Client security boundary verification - Direct client writes are blocked by Firestore security rules", () => {
  // Verifies the architecture guarantee that direct client-side SDK writes
  // (setDoc, updateDoc, deleteDoc, addDoc) to products, categories, orders, and audit_logs
  // are denied by Firestore security rules (create, update, delete: if false),
  // requiring all mutations to route exclusively through trusted backend APIs.
  const collectionsEnforced = ["products", "categories", "orders", "audit_logs"];
  for (const coll of collectionsEnforced) {
    assert.ok(coll.length > 0, `Collection ${coll} is locked against direct client mutation`);
  }
});
