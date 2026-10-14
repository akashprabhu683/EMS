import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAndNormalizePickupContact,
  validateIdempotencyKey,
  validatePaymentMethod,
  isValidProductId,
  isValidHttpsUrl,
  computeRequestFingerprint,
  executeCreateOrder,
  MAX_DISTINCT_ITEMS_PER_ORDER,
} from "../lib/orders.js";

/* ═══════════════════════════════════════════════════════════════════════
   IN-MEMORY FIRESTORE TRANSACTION ENGINE FOR REALISTIC TESTING
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
        };
      },
    };
  }

  async runTransaction(updateFunction) {
    const maxAttempts = 5;
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      const readVersions = new Map();
      const stagedWrites = [];

      const transactionContext = {
        async get(documentRef) {
          const coll = documentRef.collName;
          const id = documentRef.id;
          const entry = this._getLiveDoc(coll, id);
          const version = entry ? entry.version : 0;
          readVersions.set(`${coll}/${id}`, { coll, id, version });
          return {
            exists: !!entry,
            id,
            ref: documentRef,
            data: () => (entry ? JSON.parse(JSON.stringify(entry.data)) : undefined),
          };
        },
        set(documentRef, data) {
          stagedWrites.push({ type: "set", coll: documentRef.collName, id: documentRef.id, data });
        },
        update(documentRef, data) {
          stagedWrites.push({ type: "update", coll: documentRef.collName, id: documentRef.id, data });
        },
        delete(documentRef) {
          stagedWrites.push({ type: "delete", coll: documentRef.collName, id: documentRef.id });
        },
        _getLiveDoc: (coll, id) => this._getDoc(coll, id),
      };

      try {
        const result = await updateFunction(transactionContext);

        // Optimistic concurrency verification
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
          continue;
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
        throw err;
      }
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   TEST FIXTURES & HELPER
   ═══════════════════════════════════════════════════════════════════════ */

const validPickupContact = {
  fullName: "Akash Prabhu",
  phone: "9876543210",
  notes: "Will pick up around 4 PM",
};

function seedDatabase(db) {
  // Seed sample herbal products
  db._setDoc("products", "prod_1", {
    name: "Ashwagandha Pure Extract",
    price: 49900, // ₹499 in paise
    stock: 10,
    isActive: true,
    imageUrl: "https://images.unsplash.com/photo-ashwagandha.jpg",
  });

  db._setDoc("products", "prod_2", {
    name: "Triphala Digestive Tonic",
    price: 29900, // ₹299 in paise
    stock: 5,
    isActive: true,
    images: ["https://images.unsplash.com/photo-triphala.jpg"],
  });

  db._setDoc("products", "prod_inactive", {
    name: "Discontinued Tonic",
    price: 19900,
    stock: 10,
    isActive: false,
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
   TEST SUITE: CLICK-AND-COLLECT DISPENSARY ORDER ENGINE
   ═══════════════════════════════════════════════════════════════════════ */

test("1. Unauthenticated requests are rejected", async () => {
  const db = new MockFirestore();
  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "", {
        pickupContact: validPickupContact,
        idempotencyKey: "idem_key_12345",
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
        pickupContact: validPickupContact,
        idempotencyKey: "idem_key_empty_12",
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
        pickupContact: validPickupContact,
        idempotencyKey: "idem_key_malformed",
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
        pickupContact: validPickupContact,
        idempotencyKey: "idem_key_missing_p",
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
        pickupContact: validPickupContact,
        idempotencyKey: "idem_key_inactive",
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
        pickupContact: validPickupContact,
        idempotencyKey: "idem_key_overstock",
      });
    },
    /Insufficient stock/
  );

  // Verify stock was NOT altered
  const prod2 = db._getDoc("products", "prod_2");
  assert.equal(prod2.data.stock, 5);
});

test("5. Correct Click-and-Collect calculation (zero shipping & COD fees, unpaid status)", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  // Subtotal: 1 * 49900 + 2 * 29900 = 49900 + 59800 = 109700 paise (₹1,097)
  // Click-and-Collect: free pickup (0 shipping, 0 cod)
  // Total = 109700 paise
  const res = await executeCreateOrder(db, "user_123", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_key_click_collect_calc",
  });

  assert.equal(res.subtotal, 109700);
  assert.equal(res.shippingFee, 0);
  assert.equal(res.codFee, 0);
  assert.equal(res.total, 109700);
  assert.equal(res.orderStatus, "placed");
  assert.equal(res.paymentStatus, "unpaid");
  assert.equal(res.paymentMethod, "click_and_collect");
  assert.ok(res.pickupLocation.includes("Dispensary"));
});

test("6. Successful Click-and-Collect order decrements stock and clears cart atomically", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const initialStock1 = db._getDoc("products", "prod_1").data.stock; // 10
  const initialStock2 = db._getDoc("products", "prod_2").data.stock; // 5

  const res = await executeCreateOrder(db, "user_123", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_key_cc_success",
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
  assert.equal(order.data.fulfillmentMethod, "click_and_collect");
  assert.equal(order.data.paymentStatus, "unpaid");
  assert.equal(order.data.orderStatus, "placed");
  assert.equal(order.data.items.length, 2);
  assert.equal(order.data.pickupContact.fullName, "Akash Prabhu");
});

test("7. Repeated requests with the exact same idempotency key return cached result without double-deduction", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const key = "idem_key_repeat_cc";

  // First call
  const res1 = await executeCreateOrder(db, "user_123", {
    pickupContact: validPickupContact,
    idempotencyKey: key,
  });

  const stockAfterFirst = db._getDoc("products", "prod_1").data.stock; // 9

  // Second call with same idempotency key
  const res2 = await executeCreateOrder(db, "user_123", {
    pickupContact: validPickupContact,
    idempotencyKey: key,
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
    name: "Limited Edition Herbal Balm",
    price: 35000,
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
    pickupContact: validPickupContact,
    idempotencyKey: "idem_concurrent_A",
  });

  const orderPromiseB = executeCreateOrder(db, "user_B", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_concurrent_B",
  });

  const results = await Promise.allSettled([orderPromiseA, orderPromiseB]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  assert.equal(fulfilled.length, 1, "Exactly one order must succeed");
  assert.equal(rejected.length, 1, "Exactly one order must be rejected");
  assert.match(rejected[0].reason.message, /Insufficient stock/);

  // Stock must be exactly 0
  assert.equal(db._getDoc("products", "prod_last_unit").data.stock, 0);
});

test("9. Online payment methods are safely rejected with guidance toward Click-and-Collect", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "user_123", {
        pickupContact: validPickupContact,
        idempotencyKey: "idem_razorpay_attempt",
        paymentMethod: "razorpay",
      });
    },
    /Online payment method "razorpay" is not enabled/
  );

  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "user_123", {
        pickupContact: validPickupContact,
        idempotencyKey: "idem_upi_attempt",
        paymentMethod: "upi",
      });
    },
    /Online payment method "upi" is not enabled/
  );
});

test("10. Pickup contact validation", () => {
  // Valid contact
  const normalized = validateAndNormalizePickupContact({
    fullName: "Akash Prabhu",
    phone: "9876543210",
    notes: "Pickup Saturday",
  });
  assert.equal(normalized.fullName, "Akash Prabhu");
  assert.equal(normalized.phone, "9876543210");
  assert.equal(normalized.notes, "Pickup Saturday");

  // Invalid phone
  assert.throws(
    () => validateAndNormalizePickupContact({ fullName: "Akash", phone: "123" }),
    /valid contact phone number/
  );

  // Invalid name
  assert.throws(
    () => validateAndNormalizePickupContact({ fullName: "", phone: "9876543210" }),
    /valid customer name/
  );
});

test("11. Distinct product limit per order is enforced before reads", async () => {
  const db = new MockFirestore();

  const items = [];
  for (let i = 1; i <= 51; i++) {
    items.push({ productId: `prod_${i}`, quantity: 1 });
  }
  db._setDoc("carts", "user_bulk", { items });

  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "user_bulk", {
        pickupContact: validPickupContact,
        idempotencyKey: "idem_too_many_items",
      });
    },
    /Cart contains too many distinct items/
  );
});

test("12. Invalid product ID format is rejected before Firestore reads", async () => {
  const db = new MockFirestore();

  db._setDoc("carts", "user_invalid_pid", {
    items: [{ productId: "invalid/product/id", quantity: 1 }],
  });

  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "user_invalid_pid", {
        pickupContact: validPickupContact,
        idempotencyKey: "idem_invalid_pid",
      });
    },
    /Invalid product ID format/
  );

  assert.equal(isValidProductId("valid-prod_123.item"), true);
  assert.equal(isValidProductId("invalid/slash"), false);
  assert.equal(isValidProductId(".."), false);
  assert.equal(isValidProductId(""), false);
});

test("13. Valid and invalid HTTPS image URLs are handled correctly", () => {
  assert.equal(isValidHttpsUrl("https://images.example.com/item.png"), true);
  assert.equal(isValidHttpsUrl("http://insecure.example.com/item.png"), false);
  assert.equal(isValidHttpsUrl("ftp://invalid.com/pic.jpg"), false);
  assert.equal(isValidHttpsUrl("not-a-url"), false);
  assert.equal(isValidHttpsUrl(null), false);
  assert.equal(isValidHttpsUrl(12345), false);
});

test("14. Reusing idempotency key with different request details is rejected", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const key = "idem_key_reuse_mismatch";

  // First call succeeds
  await executeCreateOrder(db, "user_123", {
    pickupContact: validPickupContact,
    idempotencyKey: key,
  });

  // Re-seed cart with different item for same user
  db._setDoc("carts", "user_123", {
    items: [{ productId: "prod_1", quantity: 2 }],
  });

  // Second call using the SAME idempotency key but DIFFERENT order items
  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "user_123", {
        pickupContact: validPickupContact,
        idempotencyKey: key,
      });
    },
    /previously used with different order details/
  );
});
