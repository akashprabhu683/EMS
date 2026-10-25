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
  executeTransitionOrderStatus,
  executeRecordPayment,
  cleanFirestorePayload,
  PERMITTED_STATUS_TRANSITIONS,
  MAX_DISTINCT_ITEMS_PER_ORDER,
} from "../lib/orders.js";

/* ═══════════════════════════════════════════════════════════════════════
   IN-MEMORY FIRESTORE TRANSACTION ENGINE FOR REALISTIC TESTING
   ═══════════════════════════════════════════════════════════════════════ */

function assertNoUndefinedInFirestoreData(obj, path = "") {
  if (obj === undefined) {
    throw new Error(`Cannot use "undefined" as a Firestore value (found in field "${path || "root"}")`);
  }
  if (obj !== null && typeof obj === "object") {
    for (const [key, val] of Object.entries(obj)) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (val === undefined) {
        throw new Error(`Cannot use "undefined" as a Firestore value (found in field "${fieldPath}")`);
      }
      if (typeof val === "object" && val !== null) {
        assertNoUndefinedInFirestoreData(val, fieldPath);
      }
    }
  }
}

class MockFirestore {
  constructor() {
    this.store = new Map();
  }

  _getDoc(coll, id) {
    if (!this.store.has(coll)) this.store.set(coll, new Map());
    return this.store.get(coll).get(id);
  }

  _setDoc(coll, id, data) {
    assertNoUndefinedInFirestoreData(data);
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
            const merged = { ...existing.data };
            for (const [k, v] of Object.entries(w.data)) {
              if (v && v.constructor && v.constructor.name === "ArrayUnionTransform" && Array.isArray(v.elements)) {
                const currentArr = Array.isArray(merged[k]) ? [...merged[k]] : [];
                merged[k] = [...currentArr, ...v.elements];
              } else if (v && v.constructor && v.constructor.name === "ServerTimestampTransform") {
                merged[k] = new Date().toISOString();
              } else {
                merged[k] = v;
              }
            }
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

  // Seed sample customer carts
  db._setDoc("carts", "user_123", {
    items: [
      { productId: "prod_1", quantity: 1 },
      { productId: "prod_2", quantity: 2 },
    ],
  });

  db._setDoc("carts", "customer_alice", {
    items: [
      { productId: "prod_1", quantity: 1 },
      { productId: "prod_2", quantity: 1 },
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

/* ═══════════════════════════════════════════════════════════════════════
   PHASE 2: REAL-TIME ORDER & COLLECTION LIFECYCLE TESTS
   ═══════════════════════════════════════════════════════════════════════ */

test("15. Full permitted Click-and-Collect transition lifecycle: placed -> accepted -> preparing -> ready_for_pickup -> collected", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "customer_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_full_cycle",
  });

  const orderId = orderRes.orderId;
  const pickupCode = orderRes.pickupCode;
  assert.ok(pickupCode && pickupCode.length === 6, "Must generate 6-digit pickup code");

  const adminCaller = { uid: "admin_bob", email: "bob@ems.dispensary", isAdmin: true };

  // placed -> accepted
  const step1 = await executeTransitionOrderStatus({
    db,
    caller: adminCaller,
    orderId,
    newStatus: "accepted",
    note: "Pharmacist accepted order",
  });
  assert.equal(step1.newStatus, "accepted");
  assert.equal(db._getDoc("orders", orderId).data.orderStatus, "accepted");

  // accepted -> preparing
  const step2 = await executeTransitionOrderStatus({
    db,
    caller: adminCaller,
    orderId,
    newStatus: "preparing",
    note: "Packing herbal powders into air-tight containers",
  });
  assert.equal(step2.newStatus, "preparing");
  assert.equal(db._getDoc("orders", orderId).data.orderStatus, "preparing");

  // preparing -> ready_for_pickup
  const step3 = await executeTransitionOrderStatus({
    db,
    caller: adminCaller,
    orderId,
    newStatus: "ready_for_pickup",
    note: "Order placed on pickup rack counter",
  });
  assert.equal(step3.newStatus, "ready_for_pickup");
  assert.equal(db._getDoc("orders", orderId).data.orderStatus, "ready_for_pickup");

  // ready_for_pickup -> collected (requires valid pickupCode)
  const step4 = await executeTransitionOrderStatus({
    db,
    caller: adminCaller,
    orderId,
    newStatus: "collected",
    pickupCode: pickupCode,
    note: "Verified customer collection code",
  });
  assert.equal(step4.newStatus, "collected");
  assert.equal(step4.pickupVerified, true);
  assert.equal(db._getDoc("orders", orderId).data.orderStatus, "collected");
});

test("16. Out-of-sequence order transitions are rejected server-side", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "customer_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_bad_sequence",
  });

  const adminCaller = { uid: "admin_bob", email: "bob@ems.dispensary", isAdmin: true };

  // Attempting to jump directly from 'placed' to 'collected'
  await assert.rejects(
    async () => {
      await executeTransitionOrderStatus({
        db,
        caller: adminCaller,
        orderId: orderRes.orderId,
        newStatus: "collected",
        pickupCode: orderRes.pickupCode,
      });
    },
    /Invalid status transition: Cannot move from 'placed' to 'collected'/
  );

  // Attempting to jump from 'placed' to 'ready_for_pickup'
  await assert.rejects(
    async () => {
      await executeTransitionOrderStatus({
        db,
        caller: adminCaller,
        orderId: orderRes.orderId,
        newStatus: "ready_for_pickup",
      });
    },
    /Invalid status transition: Cannot move from 'placed' to 'ready_for_pickup'/
  );
});

test("17. Terminal states ('collected' and 'cancelled') cannot be transitioned further", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "customer_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_terminal_check",
  });

  const adminCaller = { uid: "admin_bob", email: "bob@ems.dispensary", isAdmin: true };

  // Cancel the order
  await executeTransitionOrderStatus({
    db,
    caller: adminCaller,
    orderId: orderRes.orderId,
    newStatus: "cancelled",
    note: "Customer cancelled",
  });

  // Attempt to transition out of 'cancelled'
  await assert.rejects(
    async () => {
      await executeTransitionOrderStatus({
        db,
        caller: adminCaller,
        orderId: orderRes.orderId,
        newStatus: "accepted",
      });
    },
    /Order is in terminal state 'cancelled' and cannot be transitioned further/
  );
});

test("18. Customer can cancel their own order only while status is 'placed'", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "customer_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_customer_cancel",
  });

  const customerCaller = { uid: "customer_alice", email: "alice@example.com", isAdmin: false };
  const adminCaller = { uid: "admin_bob", email: "bob@ems.dispensary", isAdmin: true };

  // 1. Advance to 'accepted' by admin
  await executeTransitionOrderStatus({
    db,
    caller: adminCaller,
    orderId: orderRes.orderId,
    newStatus: "accepted",
  });

  // 2. Customer attempts to cancel order that has already been accepted
  await assert.rejects(
    async () => {
      await executeTransitionOrderStatus({
        db,
        caller: customerCaller,
        orderId: orderRes.orderId,
        newStatus: "cancelled",
      });
    },
    /already been processed by the dispensary and cannot be cancelled online/
  );

  // 3. Customer attempts to set status to 'preparing' (must fail permission check)
  await assert.rejects(
    async () => {
      await executeTransitionOrderStatus({
        db,
        caller: customerCaller,
        orderId: orderRes.orderId,
        newStatus: "preparing",
      });
    },
    /Customers can only request order cancellation/
  );
});


test("19. Non-owner customer cannot cancel or touch another customer's order", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "customer_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_unauthorized_user",
  });

  const impostorCaller = { uid: "customer_eve", email: "eve@attacker.com", isAdmin: false };

  await assert.rejects(
    async () => {
      await executeTransitionOrderStatus({
        db,
        caller: impostorCaller,
        orderId: orderRes.orderId,
        newStatus: "cancelled",
      });
    },
    /You do not have permission to modify this order/
  );
});

test("20. Collection PIN verification: missing or invalid pickup code is rejected", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "customer_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_verify_code_fail",
  });

  const adminCaller = { uid: "admin_bob", email: "bob@ems.dispensary", isAdmin: true };

  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId: orderRes.orderId, newStatus: "accepted" });
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId: orderRes.orderId, newStatus: "preparing" });
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId: orderRes.orderId, newStatus: "ready_for_pickup" });

  // Missing pickupCode
  await assert.rejects(
    async () => {
      await executeTransitionOrderStatus({
        db,
        caller: adminCaller,
        orderId: orderRes.orderId,
        newStatus: "collected",
      });
    },
    /Invalid 6-digit collection code/
  );

  // Wrong pickupCode
  await assert.rejects(
    async () => {
      await executeTransitionOrderStatus({
        db,
        caller: adminCaller,
        orderId: orderRes.orderId,
        newStatus: "collected",
        pickupCode: "000000",
      });
    },
    /Invalid 6-digit collection code/
  );
});

test("21. Rate limiting: 5 failed collection attempts lock collection workflow", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "customer_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_rate_limit",
  });

  const adminCaller = { uid: "admin_bob", email: "bob@ems.dispensary", isAdmin: true };

  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId: orderRes.orderId, newStatus: "accepted" });
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId: orderRes.orderId, newStatus: "preparing" });
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId: orderRes.orderId, newStatus: "ready_for_pickup" });

  // Fail 5 times
  for (let i = 0; i < 5; i++) {
    try {
      await executeTransitionOrderStatus({
        db,
        caller: adminCaller,
        orderId: orderRes.orderId,
        newStatus: "collected",
        pickupCode: `99999${i}`,
      });
    } catch {
      // Expected failure
    }
  }

  // 6th attempt even with correct code must be locked
  await assert.rejects(
    async () => {
      await executeTransitionOrderStatus({
        db,
        caller: adminCaller,
        orderId: orderRes.orderId,
        newStatus: "collected",
        pickupCode: orderRes.pickupCode,
      });
    },
    /Pickup verification locked due to excessive failed attempts/
  );
});

test("22. Payment and fulfilment separation: recording in-person payment does NOT alter orderStatus", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "customer_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_pay_separation",
  });

  const adminCaller = { uid: "admin_bob", email: "bob@ems.dispensary", isAdmin: true };

  // Order is currently in 'placed' status
  assert.equal(db._getDoc("orders", orderRes.orderId).data.orderStatus, "placed");
  assert.equal(db._getDoc("orders", orderRes.orderId).data.paymentStatus, "unpaid");

  // Attempting to record payment on placed order is rejected
  await assert.rejects(
    async () => {
      await executeRecordPayment({
        db,
        caller: adminCaller,
        orderId: orderRes.orderId,
        note: "Customer paid in full via counter cash",
      });
    },
    /In-person payment can only be accepted once the order has been prepared and is ready for pickup or collected/
  );

  // Advance order: accepted -> preparing -> ready_for_pickup
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId: orderRes.orderId, newStatus: "accepted" });
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId: orderRes.orderId, newStatus: "preparing" });
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId: orderRes.orderId, newStatus: "ready_for_pickup" });

  assert.equal(db._getDoc("orders", orderRes.orderId).data.orderStatus, "ready_for_pickup");
  assert.equal(db._getDoc("orders", orderRes.orderId).data.paymentStatus, "unpaid");

  // Admin records in-person cash payment once ready
  const payResult = await executeRecordPayment({
    db,
    caller: adminCaller,
    orderId: orderRes.orderId,
    note: "Customer paid in full via counter cash",
  });

  assert.equal(payResult.paymentStatus, "paid");

  // Verify doc: paymentStatus is 'paid', but orderStatus is STILL 'ready_for_pickup' (not altered to collected!)
  const updatedOrder = db._getDoc("orders", orderRes.orderId).data;
  assert.equal(updatedOrder.paymentStatus, "paid");
  assert.equal(updatedOrder.orderStatus, "ready_for_pickup", "Fulfilment status must remain strictly separate from payment status");
  assert.equal(updatedOrder.paidConfirmedBy, "bob@ems.dispensary");
});

test("23. Payment recording constraints: non-admin cannot record payment, cannot pay cancelled order", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "customer_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_pay_constraints",
  });

  const customerCaller = { uid: "customer_alice", email: "alice@example.com", isAdmin: false };
  const adminCaller = { uid: "admin_bob", email: "bob@ems.dispensary", isAdmin: true };

  // Customer tries to record payment
  await assert.rejects(
    async () => {
      await executeRecordPayment({
        db,
        caller: customerCaller,
        orderId: orderRes.orderId,
      });
    },
    /Only authorized dispensary staff can record payment receipt/
  );

  // Cancel order
  await executeTransitionOrderStatus({
    db,
    caller: adminCaller,
    orderId: orderRes.orderId,
    newStatus: "cancelled",
  });

  // Admin tries to record payment on cancelled order
  await assert.rejects(
    async () => {
      await executeRecordPayment({
        db,
        caller: adminCaller,
        orderId: orderRes.orderId,
      });
    },
    /Cannot record payment on a cancelled order/
  );
});

test("24. Order cancellation automatically restores catalog stock atomically", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  // Initial stock of prod_1 is 10
  assert.equal(db._getDoc("products", "prod_1").data.stock, 10);

  // Place order for items in customer_alice cart (1 unit of prod_1)
  const orderRes = await executeCreateOrder(db, "customer_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_stock_restore",
  });

  // Stock is now 9 (10 - 1)
  assert.equal(db._getDoc("products", "prod_1").data.stock, 9);


  const adminCaller = { uid: "admin_bob", email: "bob@ems.dispensary", isAdmin: true };

  // Cancel the order
  await executeTransitionOrderStatus({
    db,
    caller: adminCaller,
    orderId: orderRes.orderId,
    newStatus: "cancelled",
    note: "Customer cancelled due to travel",
  });

  // Stock must be restored back to 10
  assert.equal(db._getDoc("products", "prod_1").data.stock, 10, "Stock must be fully restored upon cancellation");
  assert.equal(db._getDoc("orders", orderRes.orderId).data.inventoryRestored, true);
});

test("25. cleanFirestorePayload strips nested undefined while preserving null, 0, false, Date, and empty strings", () => {
  const now = new Date();
  const input = {
    validStr: "hello",
    emptyStr: "",
    zeroNum: 0,
    falseBool: false,
    nullVal: null,
    undefVal: undefined,
    nested: {
      innerOk: 123,
      innerUndef: undefined,
      deep: {
        note: undefined,
        actual: "remedy",
      },
    },
    arr: [
      { id: "1", note: undefined },
      { id: "2", active: true },
    ],
    timestamp: now,
  };

  const cleaned = cleanFirestorePayload(input);

  assert.equal(cleaned.validStr, "hello");
  assert.equal(cleaned.emptyStr, "");
  assert.equal(cleaned.zeroNum, 0);
  assert.equal(cleaned.falseBool, false);
  assert.equal(cleaned.nullVal, null);
  assert.equal("undefVal" in cleaned, false);
  assert.equal("innerUndef" in cleaned.nested, false);
  assert.equal(cleaned.nested.innerOk, 123);
  assert.equal("note" in cleaned.nested.deep, false);
  assert.equal(cleaned.nested.deep.actual, "remedy");
  assert.equal("note" in cleaned.arr[0], false);
  assert.equal(cleaned.arr[0].id, "1");
  assert.equal(cleaned.timestamp, now);
});

test("26. executeRecordPayment succeeds without note and does not throw undefined Firestore error", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "customer_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_pay_no_note",
  });

  const adminCaller = { uid: "admin_bob", email: "bob@ems.dispensary", isAdmin: true };

  // Advance order to ready_for_pickup
  await executeTransitionOrderStatus({
    db,
    caller: adminCaller,
    orderId: orderRes.orderId,
    newStatus: "accepted",
  });
  await executeTransitionOrderStatus({
    db,
    caller: adminCaller,
    orderId: orderRes.orderId,
    newStatus: "preparing",
  });
  await executeTransitionOrderStatus({
    db,
    caller: adminCaller,
    orderId: orderRes.orderId,
    newStatus: "ready_for_pickup",
  });

  // Call executeRecordPayment with note omitted / undefined
  const payRes = await executeRecordPayment({
    db,
    caller: adminCaller,
    orderId: orderRes.orderId,
    note: undefined,
  });

  assert.equal(payRes.success, true);
  assert.equal(payRes.paymentStatus, "paid");

  const orderDoc = db._getDoc("orders", orderRes.orderId).data;
  assert.equal(orderDoc.paymentStatus, "paid");

  // Check last status history entry
  const lastHistory = orderDoc.statusHistory[orderDoc.statusHistory.length - 1];
  assert.equal(lastHistory.eventType, "PAYMENT_RECORDED");
  assert.equal(lastHistory.note, "In-person payment (Cash / UPI) confirmed received at dispensary counter.");

  // Check audit log entry
  const auditLogs = Array.from(db.store.get("audit_logs").values()).map(e => e.data);
  const paymentAudit = auditLogs.find(a => a.action === "PAYMENT_RECORDED" && a.target.id === orderRes.orderId);
  assert.ok(paymentAudit, "Audit record for PAYMENT_RECORDED must exist");
  assert.equal("note" in paymentAudit.metadata, false, "metadata.note must not be present if note was undefined");
});

test("27. executeRecordPayment is idempotent on retries and prevents duplicate payment records", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "customer_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_pay_retry",
  });

  const adminCaller = { uid: "admin_bob", email: "bob@ems.dispensary", isAdmin: true };

  // Advance order to ready_for_pickup before payment
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId: orderRes.orderId, newStatus: "accepted" });
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId: orderRes.orderId, newStatus: "preparing" });
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId: orderRes.orderId, newStatus: "ready_for_pickup" });

  // First payment recording
  const firstPay = await executeRecordPayment({
    db,
    caller: adminCaller,
    orderId: orderRes.orderId,
    note: "Paid in cash at counter",
  });
  assert.equal(firstPay.success, true);

  const historyLengthAfterFirst = db._getDoc("orders", orderRes.orderId).data.statusHistory.length;
  const auditCountAfterFirst = Array.from(db.store.get("audit_logs").values()).filter(
    e => e.data.action === "PAYMENT_RECORDED" && e.data.target.id === orderRes.orderId
  ).length;
  assert.equal(auditCountAfterFirst, 1);

  // Retry the exact same payment recording
  const retryPay = await executeRecordPayment({
    db,
    caller: adminCaller,
    orderId: orderRes.orderId,
    note: "Paid in cash at counter",
  });
  assert.equal(retryPay.success, true);
  assert.equal(retryPay.alreadyPaid, true);

  const historyLengthAfterRetry = db._getDoc("orders", orderRes.orderId).data.statusHistory.length;
  const auditCountAfterRetry = Array.from(db.store.get("audit_logs").values()).filter(
    e => e.data.action === "PAYMENT_RECORDED" && e.data.target.id === orderRes.orderId
  ).length;

  assert.equal(historyLengthAfterRetry, historyLengthAfterFirst, "History length must not increase on retry");
  assert.equal(auditCountAfterRetry, 1, "Audit log must not be duplicated on retry");
});

test("28. executeTransitionOrderStatus includes explicit eventType: ORDER_STATUS_CHANGED", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "customer_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_status_event_type",
  });

  const adminCaller = { uid: "admin_bob", email: "bob@ems.dispensary", isAdmin: true };

  await executeTransitionOrderStatus({
    db,
    caller: adminCaller,
    orderId: orderRes.orderId,
    newStatus: "accepted",
  });

  const orderDoc = db._getDoc("orders", orderRes.orderId).data;
  const acceptedEntry = orderDoc.statusHistory.find(h => h.status === "accepted");
  assert.ok(acceptedEntry);
  assert.equal(acceptedEntry.eventType, "ORDER_STATUS_CHANGED");
});

test("29. Customer order cancellation is rejected if order has already been marked paid", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "customer_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_cancel_paid",
  });

  const customerCaller = { uid: "customer_alice", email: "alice@example.com", isAdmin: false };
  const adminCaller = { uid: "admin_bob", email: "bob@ems.dispensary", isAdmin: true };

  // Advance to ready_for_pickup and pay
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId: orderRes.orderId, newStatus: "accepted" });
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId: orderRes.orderId, newStatus: "preparing" });
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId: orderRes.orderId, newStatus: "ready_for_pickup" });
  await executeRecordPayment({ db, caller: adminCaller, orderId: orderRes.orderId });

  // Customer attempts to cancel paid order
  await assert.rejects(
    async () => {
      await executeTransitionOrderStatus({
        db,
        caller: customerCaller,
        orderId: orderRes.orderId,
        newStatus: "cancelled",
      });
    },
    /cannot be cancelled online/
  );
});


