import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAndNormalizeAddress,
  validateIdempotencyKey,
  validatePaymentMethod,
  executeCreateOrder,
} from "../lib/orders.js";

/* ═══════════════════════════════════════════════════════════════════════
   IN-MEMORY FIRESTORE TRANSACTION ENGINE FOR REALISTIC TESTING
   ═══════════════════════════════════════════════════════════════════════ */

class MockFirestore {
  constructor() {
    // collectionName -> (docId -> { data: any, version: number })
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
        };
      },
    };
  }

  async runTransaction(updateFunction, maxAttempts = 5) {
    let attempts = 0;
    while (attempts < maxAttempts) {
      attempts++;
      const readVersions = new Map(); // path -> version
      const stagedWrites = []; // array of actions: { type: 'set'|'update'|'delete', coll, id, data }

      const transactionContext = {
        async get(docRef) {
          const entry = this.parent._getDoc(docRef.collName, docRef.id);
          const currentVersion = entry ? entry.version : 0;
          readVersions.set(docRef.path, {
            coll: docRef.collName,
            id: docRef.id,
            version: currentVersion,
          });
          return {
            exists: !!entry,
            id: docRef.id,
            ref: docRef,
            data: () => (entry ? JSON.parse(JSON.stringify(entry.data)) : undefined),
          };
        },
        set(docRef, data) {
          stagedWrites.push({ type: "set", coll: docRef.collName, id: docRef.id, data });
        },
        update(docRef, data) {
          stagedWrites.push({ type: "update", coll: docRef.collName, id: docRef.id, data });
        },
        delete(docRef) {
          stagedWrites.push({ type: "delete", coll: docRef.collName, id: docRef.id });
        },
        parent: this,
      };

      try {
        const result = await updateFunction(transactionContext);

        // Optimistic concurrency verification: verify all reads are still at the same version
        let conflict = false;
        for (const [path, r] of readVersions.entries()) {
          const liveEntry = this._getDoc(r.coll, r.id);
          const liveVersion = liveEntry ? liveEntry.version : 0;
          if (liveVersion !== r.version) {
            conflict = true;
            break;
          }
        }

        if (conflict) {
          if (attempts >= maxAttempts) {
            throw new Error("Transaction contention limit exceeded.");
          }
          continue; // retry transaction
        }

        // Commit all staged writes atomically
        for (const w of stagedWrites) {
          if (w.type === "set") {
            this._setDoc(w.coll, w.id, w.data);
          } else if (w.type === "update") {
            const existing = this._getDoc(w.coll, w.id);
            if (!existing) throw new Error(`Cannot update non-existent document ${w.coll}/${w.id}`);
            const merged = { ...existing.data, ...w.data };
            this._setDoc(w.coll, w.id, merged);
          } else if (w.type === "delete") {
            this._deleteDoc(w.coll, w.id);
          }
        }

        return result;
      } catch (err) {
        // Atomic abort: no staged writes are committed!
        throw err;
      }
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   TEST FIXTURES & HELPER
   ═══════════════════════════════════════════════════════════════════════ */

const validShippingAddress = {
  fullName: "Akash Prabhu",
  phone: "9876543210",
  address: "123 Marine Drive",
  line2: "Apt 4B",
  city: "Mumbai",
  state: "Maharashtra",
  zip: "400020",
  country: "IN",
};

function seedDatabase(db) {
  // Seed sample products
  db._setDoc("products", "prod_1", {
    name: "Vitamin C Serum Elite",
    price: 89900, // ₹899 in paise
    stock: 10,
    isActive: true,
  });

  db._setDoc("products", "prod_2", {
    name: "Hydrating Facial Cleanser",
    price: 39900, // ₹399 in paise
    stock: 5,
    isActive: true,
  });

  db._setDoc("products", "prod_inactive", {
    name: "Discontinued Tonic",
    price: 29900,
    stock: 10,
    isActive: false,
  });

  db._setDoc("products", "prod_prepaid", {
    name: "Gold Luxury Mask (Prepaid Only)",
    price: 199900,
    stock: 5,
    isActive: true,
    prepaidOnly: true,
  });

  // Seed sample customer cart
  db._setDoc("carts", "user_123", {
    items: [
      { productId: "prod_1", quantity: 1 },
      { productId: "prod_2", quantity: 2 },
    ],
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   TEST SUITE
   ═══════════════════════════════════════════════════════════════════════ */

test("1. Unauthenticated requests are rejected", async () => {
  const db = new MockFirestore();
  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "", {
        shippingAddress: validShippingAddress,
        idempotencyKey: "idem_key_12345",
        paymentMethod: "cod",
      });
    },
    /Authentication required/
  );
});

test("2. Empty carts and malformed cart items are rejected", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  // Set empty cart
  db._setDoc("carts", "user_empty", { items: [] });
  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "user_empty", {
        shippingAddress: validShippingAddress,
        idempotencyKey: "idem_key_empty_12",
        paymentMethod: "cod",
      });
    },
    /cart is empty/
  );

  // Malformed cart item with negative quantity
  db._setDoc("carts", "user_malformed", {
    items: [{ productId: "prod_1", quantity: -2 }],
  });
  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "user_malformed", {
        shippingAddress: validShippingAddress,
        idempotencyKey: "idem_key_malformed",
        paymentMethod: "cod",
      });
    },
    /Invalid quantity/
  );
});

test("3. Inactive or missing products are safely rejected", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  // Cart with missing product ID
  db._setDoc("carts", "user_missing", {
    items: [{ productId: "non_existent_prod", quantity: 1 }],
  });
  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "user_missing", {
        shippingAddress: validShippingAddress,
        idempotencyKey: "idem_key_missing_p",
        paymentMethod: "cod",
      });
    },
    /does not exist in catalog/
  );

  // Cart with inactive product
  db._setDoc("carts", "user_inactive", {
    items: [{ productId: "prod_inactive", quantity: 1 }],
  });
  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "user_inactive", {
        shippingAddress: validShippingAddress,
        idempotencyKey: "idem_key_inactive",
        paymentMethod: "cod",
      });
    },
    /is no longer active/
  );
});

test("4. Insufficient stock is rejected without partial changes", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  // prod_2 has stock 5; request 10
  db._setDoc("carts", "user_over_stock", {
    items: [{ productId: "prod_2", quantity: 10 }],
  });

  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "user_over_stock", {
        shippingAddress: validShippingAddress,
        idempotencyKey: "idem_key_overstock",
        paymentMethod: "cod",
      });
    },
    /Insufficient stock/
  );

  // Verify stock was NOT altered
  const prod2 = db._getDoc("products", "prod_2");
  assert.equal(prod2.data.stock, 5);
});

test("5. Correct server-side paise calculation (Free shipping >= ₹999 + COD fee)", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  // Subtotal: 1 * 89900 + 2 * 39900 = 89900 + 79800 = 169700 paise (₹1,697)
  // Subtotal >= 99900 -> shippingFee = 0 paise
  // COD fee = 4900 paise
  // Total = 169700 + 0 + 4900 = 174600 paise (₹1,746)

  const res = await executeCreateOrder(db, "user_123", {
    shippingAddress: validShippingAddress,
    idempotencyKey: "idem_key_paise_calc",
    paymentMethod: "cod",
  });

  assert.equal(res.subtotal, 169700);
  assert.equal(res.shippingFee, 0);
  assert.equal(res.codFee, 4900);
  assert.equal(res.total, 174600);
  assert.equal(res.orderStatus, "confirmed");
  assert.equal(res.paymentStatus, "cod_pending");
});

test("6. Successful COD order creation decrements stock and clears cart atomically", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const initialStock1 = db._getDoc("products", "prod_1").data.stock; // 10
  const initialStock2 = db._getDoc("products", "prod_2").data.stock; // 5

  const res = await executeCreateOrder(db, "user_123", {
    shippingAddress: validShippingAddress,
    idempotencyKey: "idem_key_cod_success",
    paymentMethod: "cod",
  });

  assert.ok(res.orderId, "Order ID should be generated");

  // Verify product inventory decremented
  assert.equal(db._getDoc("products", "prod_1").data.stock, initialStock1 - 1);
  assert.equal(db._getDoc("products", "prod_2").data.stock, initialStock2 - 2);

  // Verify cart cleared
  const cart = db._getDoc("carts", "user_123");
  assert.deepEqual(cart.data.items, []);

  // Verify order document created
  const order = db._getDoc("orders", res.orderId);
  assert.ok(order, "Order document must exist");
  assert.equal(order.data.userId, "user_123");
  assert.equal(order.data.paymentMethod, "cod");
  assert.equal(order.data.items.length, 2);
});

test("7. Repeated requests with the same idempotency key return cached result without double-deduction", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const key = "idem_key_repeat_test";

  // First call
  const res1 = await executeCreateOrder(db, "user_123", {
    shippingAddress: validShippingAddress,
    idempotencyKey: key,
    paymentMethod: "cod",
  });

  const stockAfterFirst = db._getDoc("products", "prod_1").data.stock; // 9

  // Second call with same idempotency key
  const res2 = await executeCreateOrder(db, "user_123", {
    shippingAddress: validShippingAddress,
    idempotencyKey: key,
    paymentMethod: "cod",
  });

  // Both responses must be identical
  assert.equal(res1.orderId, res2.orderId);
  assert.equal(res1.total, res2.total);

  // Stock must NOT have been deducted a second time!
  assert.equal(db._getDoc("products", "prod_1").data.stock, stockAfterFirst);
});

test("8. Concurrent purchases of the final stock unit: exactly one succeeds and one fails", async () => {
  const db = new MockFirestore();

  // Product with ONLY 1 unit left in stock
  db._setDoc("products", "prod_last_unit", {
    name: "Limited Edition Serum",
    price: 150000,
    stock: 1,
    isActive: true,
  });

  // User A cart: 1 unit
  db._setDoc("carts", "user_A", {
    items: [{ productId: "prod_last_unit", quantity: 1 }],
  });

  // User B cart: 1 unit
  db._setDoc("carts", "user_B", {
    items: [{ productId: "prod_last_unit", quantity: 1 }],
  });

  // Fire both orders concurrently
  const orderPromiseA = executeCreateOrder(db, "user_A", {
    shippingAddress: validShippingAddress,
    idempotencyKey: "idem_concurrent_A",
    paymentMethod: "cod",
  });

  const orderPromiseB = executeCreateOrder(db, "user_B", {
    shippingAddress: validShippingAddress,
    idempotencyKey: "idem_concurrent_B",
    paymentMethod: "cod",
  });

  const results = await Promise.allSettled([orderPromiseA, orderPromiseB]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  assert.equal(fulfilled.length, 1, "Exactly one order must succeed");
  assert.equal(rejected.length, 1, "Exactly one order must be rejected");
  assert.match(rejected[0].reason.message, /Insufficient stock/);

  // Stock must be exactly 0 (no overselling or negative inventory)
  assert.equal(db._getDoc("products", "prod_last_unit").data.stock, 0);
});

test("9. Transaction failure leaves NO partial order or stock deduction", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const initialStock1 = db._getDoc("products", "prod_1").data.stock;

  // Cart with valid product 1 and prepaid-only product for COD
  db._setDoc("carts", "user_fail_midway", {
    items: [
      { productId: "prod_1", quantity: 1 },
      { productId: "prod_prepaid", quantity: 1 },
    ],
  });

  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "user_fail_midway", {
        shippingAddress: validShippingAddress,
        idempotencyKey: "idem_fail_midway",
        paymentMethod: "cod",
      });
    },
    /marked as prepaid only/
  );

  // Verify stock of prod_1 was NOT decremented despite prod_1 being valid
  assert.equal(db._getDoc("products", "prod_1").data.stock, initialStock1);
});

test("10. Online payment methods are safely rejected with actionable guidance", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "user_123", {
        shippingAddress: validShippingAddress,
        idempotencyKey: "idem_razorpay_attempt",
        paymentMethod: "razorpay",
      });
    },
    /Online payment method "razorpay" is not yet supported/
  );

  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "user_123", {
        shippingAddress: validShippingAddress,
        idempotencyKey: "idem_upi_attempt",
        paymentMethod: "upi",
      });
    },
    /Online payment method "upi" is not yet supported/
  );
});
