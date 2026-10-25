import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  executeCreateOrder,
  executeTransitionOrderStatus,
  executeRecordPayment,
  computeRequestFingerprint,
} from "../lib/orders.js";

/* ═══════════════════════════════════════════════════════════════════════
   IN-MEMORY FIRESTORE WITH TRANSACTION AND CONCURRENCY SUPPORT
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
        };
      },
    };
  }

  async runTransaction(updateFunction) {
    const maxAttempts = 10;
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

        // Optimistic concurrency conflict check
        let conflict = false;
        for (const [, r] of readVersions.entries()) {
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
          // Brief backoff before retry to simulate realistic interleaving
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
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
        // If it's a conflict retry, loop
        if (err.message === "Transaction contention limit exceeded.") {
          throw err;
        }
        throw err;
      }
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   TEST SEEDING & HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

const validPickupContact = {
  fullName: "Alice Smith",
  phone: "+91 98765 43210",
  notes: "Please pack with extra herbal care",
};

function seedDatabase(db) {
  // Product 1
  db._setDoc("products", "prod_ashwa", {
    name: "Ashwagandha Organic Churna",
    price: 35000, // ₹350.00
    stock: 10,
    isActive: true,
  });

  // Product 2
  db._setDoc("products", "prod_triphala", {
    name: "Triphala Digestive Tonic",
    price: 28000, // ₹280.00
    stock: 5,
    isActive: true,
  });

  // Customer Alice Cart
  db._setDoc("carts", "user_alice", {
    items: [
      { productId: "prod_ashwa", quantity: 2 },
    ],
  });
}

/**
 * Simulates the Express backend POST /api/orders transactional logic
 * using the shared idempotency_records collection and SHA-256 fingerprinting.
 */
async function simulateExpressCheckout(db, uid, body) {
  const { pickupContact, idempotencyKey } = body;
  const fullName = String(pickupContact?.fullName || "").trim();
  const phone = String(pickupContact?.phone || "").trim();

  const cartRef = db.collection("carts").doc(uid);
  const idempRef = idempotencyKey
    ? db.collection("idempotency_records").doc(`${uid}_${idempotencyKey}`)
    : null;
  const legacyIdempRef = idempotencyKey
    ? db.collection("idempotency_keys").doc(idempotencyKey)
    : null;

  return await db.runTransaction(async (txn) => {
    const cartSnap = await txn.get(cartRef);
    const idempSnap = idempRef ? await txn.get(idempRef) : null;
    const legacyIdempSnap = legacyIdempRef ? await txn.get(legacyIdempRef) : null;

    let existingIdemp = null;
    if (idempSnap && idempSnap.exists) {
      existingIdemp = idempSnap.data();
    } else if (legacyIdempSnap && legacyIdempSnap.exists) {
      const leg = legacyIdempSnap.data();
      if (leg && (leg.userId === uid || leg.uid === uid)) {
        existingIdemp = leg;
      }
    }

    if (existingIdemp) {
      const rawCart = (cartSnap.exists && Array.isArray(cartSnap.data()?.items) && cartSnap.data().items.length > 0)
        ? cartSnap.data().items
        : (Array.isArray(body.items) ? body.items : []);

      if (rawCart.length > 0) {
        const currentFp = computeRequestFingerprint(
          uid,
          rawCart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          { fullName, phone, notes: pickupContact.notes || "" },
          "click_and_collect"
        );

        if (existingIdemp.requestFingerprint && existingIdemp.requestFingerprint !== currentFp) {
          const err = new Error("This idempotency key was previously used with different order details. Please supply a fresh idempotency key.");
          err.statusCode = 409;
          throw err;
        }
      }

      if (existingIdemp.response) {
        return existingIdemp.response;
      }
    }

    const rawCartList = (cartSnap.exists && Array.isArray(cartSnap.data()?.items) && cartSnap.data().items.length > 0)
      ? cartSnap.data().items
      : (Array.isArray(body.items) ? body.items : []);

    if (rawCartList.length === 0) {
      throw new Error("Your cart is empty. Please add items before checking out.");
    }

    const productIds = rawCartList.map((i) => i.productId);
    const productSnaps = await Promise.all(productIds.map((pid) => txn.get(db.collection("products").doc(pid))));

    let subtotal = 0;
    for (let i = 0; i < productIds.length; i++) {
      const pSnap = productSnaps[i];
      if (!pSnap.exists || !pSnap.data().isActive) {
        throw new Error("Product unavailable.");
      }
      const pData = pSnap.data();
      const reqQty = rawCartList[i].quantity;
      if (pData.stock < reqQty) {
        throw new Error("Insufficient stock.");
      }
      subtotal += pData.price * reqQty;
    }

    const orderRef = db.collection("orders").doc();
    const orderId = orderRef.id;
    const pickupCode = "654321";

    const responsePayload = {
      orderId,
      subtotal,
      total: subtotal,
      orderStatus: "placed",
      paymentStatus: "unpaid",
      paymentMethod: "click_and_collect",
      pickupCode,
      createdAt: new Date().toISOString(),
    };

    const currentFp = computeRequestFingerprint(
      uid,
      rawCartList.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      { fullName, phone, notes: pickupContact.notes || "" },
      "click_and_collect"
    );

    // Writes
    txn.set(orderRef, {
      id: orderId,
      userId: uid,
      orderStatus: "placed",
      paymentStatus: "unpaid",
      subtotal,
      total: subtotal,
      items: rawCartList,
      inventoryDeducted: true,
      pickupCode,
    });

    for (let i = 0; i < productIds.length; i++) {
      const pRef = db.collection("products").doc(productIds[i]);
      const pData = productSnaps[i].data();
      txn.update(pRef, { stock: pData.stock - rawCartList[i].quantity });
    }

    if (idempRef) {
      txn.set(idempRef, {
        uid,
        idempotencyKey,
        orderId,
        requestFingerprint: currentFp,
        response: responsePayload,
      });
    }

    txn.set(cartRef, { items: [] });
    return responsePayload;
  });
}

/**
 * Simulates the Express backend PATCH /api/admin/orders/:id/status transactional logic.
 */
async function simulateExpressStatusTransition(db, orderId, targetStatus, adminEmail, pickupCode) {
  const orderRef = db.collection("orders").doc(orderId);
  const PERMITTED_TRANSITIONS = {
    placed: ["accepted", "cancelled"],
    accepted: ["preparing", "cancelled"],
    preparing: ["ready_for_pickup", "cancelled"],
    ready_for_pickup: ["collected", "cancelled"],
    collected: [],
    cancelled: [],
  };

  const result = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(orderRef);
    if (!snap.exists) {
      const err = new Error(`Order ${orderId} not found.`);
      err.statusCode = 404;
      throw err;
    }

    const currentOrder = snap.data();
    const currentStatus = currentOrder.orderStatus || "placed";

    if (currentStatus === targetStatus) {
      return { success: true, orderId, updatedStatus: targetStatus };
    }

    if (currentStatus === "collected" || currentStatus === "cancelled") {
      const err = new Error(`Order is in terminal state '${currentStatus}' and cannot be transitioned further.`);
      err.statusCode = 400;
      throw err;
    }

    const allowed = PERMITTED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      const err = new Error(`Invalid transition from '${currentStatus}' to '${targetStatus}'. Allowed: ${allowed.join(', ') || 'none'}`);
      err.statusCode = 400;
      throw err;
    }

    // Collection PIN verification
    if (targetStatus === "collected") {
      const attempts = Number(currentOrder.pickupAttempts || 0);
      const maxAttempts = Number(currentOrder.maxPickupAttempts || 5);
      if (attempts >= maxAttempts) {
        const err = new Error("Pickup verification locked due to excessive failed attempts (>5). Verify identity manually.");
        err.statusCode = 400;
        throw err;
      }

      const cleanCode = String(pickupCode || "").trim();
      const expectedCode = String(currentOrder.pickupCode || "").trim();
      if (!cleanCode || cleanCode !== expectedCode) {
        const nextAttempts = attempts + 1;
        transaction.update(orderRef, {
          pickupAttempts: nextAttempts,
          updatedAt: new Date().toISOString(),
        });
        const remaining = Math.max(0, maxAttempts - nextAttempts);
        return {
          failedVerification: true,
          remaining,
          nextAttempts,
        };
      }
    }

    // Cancellation stock restoration
    const shouldRestore = targetStatus === "cancelled" && currentOrder.inventoryDeducted && !currentOrder.inventoryRestored;
    const items = Array.isArray(currentOrder.items) ? currentOrder.items : [];
    const prodUpdates = [];

    if (shouldRestore) {
      for (const item of items) {
        if (!item.productId) continue;
        const prodRef = db.collection("products").doc(item.productId);
        const prodSnap = await transaction.get(prodRef);
        if (prodSnap.exists) {
          const cur = Number(prodSnap.data()?.stock ?? 0);
          prodUpdates.push({ ref: prodRef, newStock: cur + Number(item.quantity ?? 1) });
        }
      }
    }

    // Writes
    for (const u of prodUpdates) {
      transaction.update(u.ref, { stock: u.newStock });
    }

    const updatePayload = {
      orderStatus: targetStatus,
    };
    if (shouldRestore) {
      updatePayload.inventoryRestored = true;
    }
    transaction.update(orderRef, updatePayload);

    const auditRef = db.collection("audit_logs").doc();
    transaction.set(auditRef, {
      action: targetStatus === "collected" ? "ORDER_COLLECTED" : targetStatus === "cancelled" ? "ORDER_CANCELLED" : "ORDER_STATUS_CHANGED",
      actorId: adminEmail,
      orderId,
      summary: `Order #${orderId} status transitioned to ${targetStatus}`,
    });

    return { success: true, orderId, updatedStatus: targetStatus };
  });

  if (result && result.failedVerification) {
    const err = new Error(`Invalid 6-digit collection code. ${result.remaining} attempts remaining before lock.`);
    err.statusCode = 400;
    throw err;
  }

  return result;
}

/* ═══════════════════════════════════════════════════════════════════════
   TEST SUITE: CONCURRENCY & CROSS-BACKEND IDEMPOTENCY
   ═══════════════════════════════════════════════════════════════════════ */

test("Phase 6B.1: Concurrent customer cancellation and admin acceptance are mutually safe", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  // Place initial order
  const orderRes = await executeCreateOrder(db, "user_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_concurrency_race_1",
  });

  const orderId = orderRes.orderId;
  assert.equal(db._getDoc("products", "prod_ashwa").data.stock, 8); // 10 - 2

  // Simulate concurrent execution: Customer cancellation vs Admin acceptance
  const customerCaller = { uid: "user_alice", email: "alice@example.com", isAdmin: false };
  const adminEmail = "pharmacist@ems.dispensary";

  const [resCustomer, resAdmin] = await Promise.allSettled([
    executeTransitionOrderStatus({
      db,
      caller: customerCaller,
      orderId,
      newStatus: "cancelled",
      note: "Customer decided to cancel",
    }),
    simulateExpressStatusTransition(db, orderId, "accepted", adminEmail),
  ]);

  // Exactly one of the two must succeed, and the loser must be rejected by transaction rules
  const successes = [resCustomer, resAdmin].filter((r) => r.status === "fulfilled");
  const rejections = [resCustomer, resAdmin].filter((r) => r.status === "rejected");

  assert.equal(successes.length, 1, "Exactly one of the concurrent transitions must succeed");
  assert.equal(rejections.length, 1, "The competing transition must be rejected");

  const finalOrder = db._getDoc("orders", orderId).data;
  if (finalOrder.orderStatus === "cancelled") {
    // If customer cancellation won the race, stock must be restored to 10
    assert.equal(db._getDoc("products", "prod_ashwa").data.stock, 10);
    assert.match(rejections[0].reason.message, /terminal state/);
  } else {
    // If admin acceptance won the race, status is accepted, stock remains 8
    assert.equal(finalOrder.orderStatus, "accepted");
    assert.equal(db._getDoc("products", "prod_ashwa").data.stock, 8);
    assert.match(rejections[0].reason.message, /already been processed/);
  }
});

test("Phase 6B.2: Concurrent duplicate checkout requests with the same idempotency key create only one order and do not double-deduct stock", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  // Set stock of prod_triphala to 3
  db._setDoc("products", "prod_triphala", {
    name: "Triphala Tonic",
    price: 20000,
    stock: 3,
    isActive: true,
  });

  db._setDoc("carts", "user_alice", {
    items: [{ productId: "prod_triphala", quantity: 2 }],
  });

  const idemKey = "idem_concurrent_checkout_dupe";

  // Fire two concurrent requests with identical idempotency key
  const [res1, res2] = await Promise.allSettled([
    executeCreateOrder(db, "user_alice", {
      pickupContact: validPickupContact,
      idempotencyKey: idemKey,
    }),
    executeCreateOrder(db, "user_alice", {
      pickupContact: validPickupContact,
      idempotencyKey: idemKey,
    }),
  ]);

  assert.equal(res1.status, "fulfilled");
  assert.equal(res2.status, "fulfilled");

  // Both results must return the exact same orderId
  assert.equal(res1.value.orderId, res2.value.orderId);

  // Stock must be 1 (3 - 2), NOT -1 (never double-deducted)
  assert.equal(db._getDoc("products", "prod_triphala").data.stock, 1);

  // Cart must be empty
  assert.deepEqual(db._getDoc("carts", "user_alice").data.items, []);
});

test("Phase 6B.3: Cross-backend retry interoperability: Cloud Functions to Express", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const idemKey = "idem_cross_cf_to_express";

  // Step 1: Place order via Cloud Functions
  const cfResult = await executeCreateOrder(db, "user_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: idemKey,
  });

  assert.ok(cfResult.orderId);
  const originalStock = db._getDoc("products", "prod_ashwa").data.stock;
  assert.equal(originalStock, 8); // 10 - 2

  // Step 2: Retry via Express backend with the same idempotency key and same details
  const expResult = await simulateExpressCheckout(db, "user_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: idemKey,
    items: [{ productId: "prod_ashwa", quantity: 2 }],
  });

  // Must return the exact same orderId created by Cloud Functions
  assert.equal(expResult.orderId, cfResult.orderId);

  // Stock must NOT be decremented again
  assert.equal(db._getDoc("products", "prod_ashwa").data.stock, 8);
});

test("Phase 6B.4: Cross-backend retry interoperability: Express to Cloud Functions", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const idemKey = "idem_cross_express_to_cf";

  // Step 1: Place order via Express
  const expResult = await simulateExpressCheckout(db, "user_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: idemKey,
  });

  assert.ok(expResult.orderId);
  assert.equal(db._getDoc("products", "prod_ashwa").data.stock, 8);

  // Step 2: Client retries via Cloud Functions
  const cfResult = await executeCreateOrder(db, "user_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: idemKey,
  });

  assert.equal(cfResult.orderId, expResult.orderId);
  assert.equal(db._getDoc("products", "prod_ashwa").data.stock, 8);
});

test("Phase 6B.5: Reusing an idempotency key with a different payload is rejected", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const idemKey = "idem_reused_key_different_payload";

  // Place initial order with Ashwagandha
  await executeCreateOrder(db, "user_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: idemKey,
  });

  // Repopulate cart with Triphala
  db._setDoc("carts", "user_alice", {
    items: [{ productId: "prod_triphala", quantity: 1 }],
  });

  // Attempt to checkout with the same key but different cart contents
  await assert.rejects(
    async () => {
      await executeCreateOrder(db, "user_alice", {
        pickupContact: validPickupContact,
        idempotencyKey: idemKey,
      });
    },
    /previously used with different order details/
  );
});

test("Phase 6B.6: Inventory is restored exactly once during repeated/idempotent cancellation calls", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "user_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_single_restore_test",
  });

  assert.equal(db._getDoc("products", "prod_ashwa").data.stock, 8);

  const adminCaller = { uid: "admin_1", email: "admin@ems.dispensary", isAdmin: true };

  // First cancellation: Restores stock from 8 to 10
  await executeTransitionOrderStatus({
    db,
    caller: adminCaller,
    orderId: orderRes.orderId,
    newStatus: "cancelled",
    note: "Customer called dispensary to cancel",
  });

  assert.equal(db._getDoc("products", "prod_ashwa").data.stock, 10);
  assert.equal(db._getDoc("orders", orderRes.orderId).data.inventoryRestored, true);

  // Idempotent repeat: calling cancelled again must NOT add stock a second time
  await executeTransitionOrderStatus({
    db,
    caller: adminCaller,
    orderId: orderRes.orderId,
    newStatus: "cancelled",
  });

  assert.equal(db._getDoc("products", "prod_ashwa").data.stock, 10, "Stock must remain 10, not 12");
});

test("Phase 6B.7: Failed status transitions leave order state, stock, and audit history consistent", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "user_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_failed_transition",
  });

  const adminEmail = "dispensary@ems.shop";

  // Attempt illegal transition: placed -> collected without advancing through accepted/preparing/ready
  await assert.rejects(
    async () => {
      await simulateExpressStatusTransition(db, orderRes.orderId, "collected", adminEmail, "654321");
    },
    /Invalid transition/
  );

  // Order state must still be 'placed'
  assert.equal(db._getDoc("orders", orderRes.orderId).data.orderStatus, "placed");
  assert.equal(db._getDoc("products", "prod_ashwa").data.stock, 8);

  // Audit collection must not contain any ORDER_COLLECTED record for this order
  const auditLogs = Array.from(db.store.get("audit_logs")?.values() || []);
  const collectedLogs = auditLogs.filter((l) => l.data.orderId === orderRes.orderId && l.data.action === "ORDER_COLLECTED");
  assert.equal(collectedLogs.length, 0);
});

test("Phase 6B.8: Pickup PIN verification, 5-failure lockout, and in-person payment protections remain strictly enforced in Express transactions", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "user_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_express_pin_lockout",
  });

  const adminEmail = "dispensary@ems.shop";
  const orderId = orderRes.orderId;

  // Advance to accepted -> preparing -> ready_for_pickup
  await simulateExpressStatusTransition(db, orderId, "accepted", adminEmail);
  await simulateExpressStatusTransition(db, orderId, "preparing", adminEmail);
  await simulateExpressStatusTransition(db, orderId, "ready_for_pickup", adminEmail);

  // 1. Wrong PIN fails and increments attempts
  await assert.rejects(
    async () => {
      await simulateExpressStatusTransition(db, orderId, "collected", adminEmail, "000000");
    },
    /Invalid 6-digit collection code/
  );
  assert.equal(db._getDoc("orders", orderId).data.pickupAttempts, 1);

  // 2. Accumulate up to 5 failed attempts
  for (let i = 2; i <= 5; i++) {
    await assert.rejects(
      async () => {
        await simulateExpressStatusTransition(db, orderId, "collected", adminEmail, "000000");
      },
      /Invalid 6-digit collection code/
    );
  }

  // 3. Attempt 6: Locked out even with the correct PIN
  await assert.rejects(
    async () => {
      const correctPin = db._getDoc("orders", orderId).data.pickupCode;
      await simulateExpressStatusTransition(db, orderId, "collected", adminEmail, correctPin);
    },
    /locked due to excessive failed attempts/
  );

  // Status must remain ready_for_pickup
  assert.equal(db._getDoc("orders", orderId).data.orderStatus, "ready_for_pickup");
});

test("Phase 6B.9: Production executeTransitionOrderStatus increments stored pickupAttempts counter on invalid PIN and enforces 5-failure lockout", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "user_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_prod_pin_lockout_direct",
  });

  const orderId = orderRes.orderId;
  const adminCaller = { uid: "admin_tester", email: "admin@ems.dispensary", isAdmin: true };

  // Advance to accepted -> preparing -> ready_for_pickup via actual production function
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId, newStatus: "accepted" });
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId, newStatus: "preparing" });
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId, newStatus: "ready_for_pickup" });

  assert.equal(db._getDoc("orders", orderId).data.orderStatus, "ready_for_pickup");
  assert.equal(db._getDoc("orders", orderId).data.pickupAttempts || 0, 0);

  // 1. First incorrect PIN attempt via production function
  await assert.rejects(
    async () => {
      await executeTransitionOrderStatus({
        db,
        caller: adminCaller,
        orderId,
        newStatus: "collected",
        pickupCode: "000000",
      });
    },
    /Invalid 6-digit collection code\. 4 attempts remaining/
  );

  // Verify the stored document counter has persisted value 1
  assert.equal(db._getDoc("orders", orderId).data.pickupAttempts, 1);
  assert.equal(db._getDoc("orders", orderId).data.orderStatus, "ready_for_pickup");

  // 2. Attempts 2, 3, 4, 5 with wrong PIN
  for (let i = 2; i <= 5; i++) {
    await assert.rejects(
      async () => {
        await executeTransitionOrderStatus({
          db,
          caller: adminCaller,
          orderId,
          newStatus: "collected",
          pickupCode: "000000",
        });
      },
      /Invalid 6-digit collection code/
    );
    assert.equal(db._getDoc("orders", orderId).data.pickupAttempts, i);
  }

  // Counter must be exactly 5
  assert.equal(db._getDoc("orders", orderId).data.pickupAttempts, 5);

  // 3. Attempt 6 with the correct PIN must be locked out
  const correctPin = db._getDoc("orders", orderId).data.pickupCode;
  await assert.rejects(
    async () => {
      await executeTransitionOrderStatus({
        db,
        caller: adminCaller,
        orderId,
        newStatus: "collected",
        pickupCode: correctPin,
      });
    },
    /locked due to excessive failed attempts/
  );

  // Status must remain ready_for_pickup
  assert.equal(db._getDoc("orders", orderId).data.orderStatus, "ready_for_pickup");
});

test("Phase 6B.10: Concurrent incorrect PIN submissions against production executeTransitionOrderStatus are transactionally serialized", async () => {
  const db = new MockFirestore();
  seedDatabase(db);

  const orderRes = await executeCreateOrder(db, "user_alice", {
    pickupContact: validPickupContact,
    idempotencyKey: "idem_concurrent_wrong_pins",
  });

  const orderId = orderRes.orderId;
  const adminCaller = { uid: "admin_tester", email: "admin@ems.dispensary", isAdmin: true };

  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId, newStatus: "accepted" });
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId, newStatus: "preparing" });
  await executeTransitionOrderStatus({ db, caller: adminCaller, orderId, newStatus: "ready_for_pickup" });

  assert.equal(db._getDoc("orders", orderId).data.pickupAttempts || 0, 0);

  // Fire 4 concurrent incorrect PIN attempts
  const results = await Promise.allSettled([
    executeTransitionOrderStatus({ db, caller: adminCaller, orderId, newStatus: "collected", pickupCode: "111111" }),
    executeTransitionOrderStatus({ db, caller: adminCaller, orderId, newStatus: "collected", pickupCode: "222222" }),
    executeTransitionOrderStatus({ db, caller: adminCaller, orderId, newStatus: "collected", pickupCode: "333333" }),
    executeTransitionOrderStatus({ db, caller: adminCaller, orderId, newStatus: "collected", pickupCode: "444444" }),
  ]);

  // All 4 must be rejected
  for (const r of results) {
    assert.equal(r.status, "rejected");
  }

  // Because transactions serialize concurrent updates to the same document, all 4 attempts must be counted!
  const finalAttempts = db._getDoc("orders", orderId).data.pickupAttempts;
  assert.equal(finalAttempts, 4, `All 4 concurrent failed attempts must be counted. Found: ${finalAttempts}`);

  // One more incorrect attempt triggers attempt 5
  await assert.rejects(
    async () => {
      await executeTransitionOrderStatus({ db, caller: adminCaller, orderId, newStatus: "collected", pickupCode: "555555" });
    },
    /Invalid 6-digit collection code\. 0 attempts remaining/
  );
  assert.equal(db._getDoc("orders", orderId).data.pickupAttempts, 5);

  // Attempt 6 is locked out
  await assert.rejects(
    async () => {
      await executeTransitionOrderStatus({ db, caller: adminCaller, orderId, newStatus: "collected", pickupCode: "999999" });
    },
    /locked due to excessive failed attempts/
  );
});

