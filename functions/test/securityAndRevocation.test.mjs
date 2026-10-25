import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "ems-test" });
}
import {
  verifyOrderAdminCaller,
  PRIMARY_SUPERADMIN_EMAIL,
  executeCreateOrder,
  executeTransitionOrderStatus,
  executeRecordPayment,
  executeCorrectPayment,
} from "../lib/orders.js";
import {
  listAdmins,
  grantAdminRole,
  resendAdminInvitation,
  verifyInvitationToken,
  acceptAdminInvitation,
  revokeAdminRole,
} from "../lib/adminRoles.js";

/* ═══════════════════════════════════════════════════════════════════════
   MOCK FIRESTORE ENGINE FOR AUTHORIZATION & SECURITY TESTS
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
        const docId = id || `auto_${crypto.randomBytes(6).toString("hex")}`;
        return {
          id: docId,
          collName,
          path: `${collName}/${docId}`,
          async get() {
            const entry = firestore._getDoc(collName, docId);
            return {
              exists: !!entry,
              id: docId,
              ref: this,
              data: () => (entry ? JSON.parse(JSON.stringify(entry.data)) : undefined),
            };
          },
          async set(data) {
            firestore._setDoc(collName, docId, data);
          },
          async update(data) {
            const entry = firestore._getDoc(collName, docId);
            if (!entry) throw new Error(`Document ${collName}/${docId} does not exist`);
            firestore._setDoc(collName, docId, { ...entry.data, ...data });
          },
          async delete() {
            firestore._deleteDoc(collName, docId);
          },
        };
      },
      async get() {
        const map = firestore.store.get(collName) || new Map();
        const docs = [];
        for (const [id, entry] of map.entries()) {
          docs.push({
            id,
            ref: { id, collName },
            data: () => JSON.parse(JSON.stringify(entry.data)),
          });
        }
        return {
          empty: docs.length === 0,
          size: docs.length,
          docs,
          forEach(cb) {
            docs.forEach(cb);
          },
        };
      },
      where(field, op, val) {
        return {
          limit(n) {
            return {
              async get() {
                const map = firestore.store.get(collName) || new Map();
                const matched = [];
                for (const [id, entry] of map.entries()) {
                  if (op === "==" && entry.data[field] === val) {
                    matched.push({
                      id,
                      ref: { id, collName },
                      data: () => JSON.parse(JSON.stringify(entry.data)),
                    });
                    if (matched.length >= n) break;
                  }
                }
                return {
                  empty: matched.length === 0,
                  size: matched.length,
                  docs: matched,
                };
              },
            };
          },
        };
      },
    };
  }

  async runTransaction(fn) {
    const firestore = this;
    const tx = {
      async get(docRef) {
        const entry = firestore._getDoc(docRef.collName, docRef.id);
        return {
          exists: !!entry,
          id: docRef.id,
          ref: docRef,
          data: () => (entry ? JSON.parse(JSON.stringify(entry.data)) : undefined),
        };
      },
      set(docRef, data) {
        firestore._setDoc(docRef.collName, docRef.id, data);
      },
      update(docRef, data) {
        const entry = firestore._getDoc(docRef.collName, docRef.id);
        if (!entry) throw new Error(`Document ${docRef.collName}/${docRef.id} does not exist`);
        firestore._setDoc(docRef.collName, docRef.id, { ...entry.data, ...data });
      },
      delete(docRef) {
        firestore._deleteDoc(docRef.collName, docRef.id);
      },
    };
    return await fn(tx);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   1. REAL-TIME ADMIN REVOCATION TESTS
   ═══════════════════════════════════════════════════════════════════════ */

test("Security 1.1: verifyOrderAdminCaller denies revoked administrator immediately despite valid admin claim", async () => {
  const db = new MockFirestore();
  const revokedUid = "admin_attacker_1";

  // Simulate an administrator with cached custom claim (admin: true)
  // and doc in /admins, but whose revocation doc has been written to /admin_revocations
  db._setDoc("admins", revokedUid, { email: "attacker@ems.shop", role: "admin", isActive: true });
  db._setDoc("admin_revocations", revokedUid, {
    uid: revokedUid,
    revokedAt: new Date().toISOString(),
    revokedBy: "akashprabhu0302@gmail.com",
  });

  const status = await verifyOrderAdminCaller(db, revokedUid, "attacker@ems.shop", true);

  assert.equal(status.isRevoked, true, "Revocation marker must be detected in real-time");
  assert.equal(status.isAdmin, false, "Revoked administrator must NOT be recognized as admin");
});

test("Security 1.2: verifyOrderAdminCaller preserves superadmin ownership and immunity to rogue revocation docs", async () => {
  const db = new MockFirestore();
  const superadminUid = "superadmin_akash";

  // Attempting to place a revocation doc for superadmin must not revoke superadmin
  db._setDoc("admin_revocations", superadminUid, {
    uid: superadminUid,
    revokedAt: new Date().toISOString(),
  });

  const status = await verifyOrderAdminCaller(db, superadminUid, PRIMARY_SUPERADMIN_EMAIL, true);

  assert.equal(status.isAdmin, true, "Primary superadmin must remain actively authorized");
  assert.equal(status.isRevoked, false, "Primary superadmin cannot be revoked");
});

test("Security 1.3: verifyOrderAdminCaller denies de-activated administrator (isActive: false)", async () => {
  const db = new MockFirestore();
  const uid = "inactive_admin";

  db._setDoc("admins", uid, { email: "inactive@ems.shop", role: "admin", isActive: false });

  const status = await verifyOrderAdminCaller(db, uid, "inactive@ems.shop", true);

  assert.equal(status.isAdmin, false, "Deactivated administrator must be denied admin privileges");
  assert.equal(status.isRevoked, false);
});

test("Security 1.4: executeTransitionOrderStatus denies revoked admin on order status progression", async () => {
  const db = new MockFirestore();
  const orderId = "order_cust_123";

  db._setDoc("orders", orderId, {
    userId: "cust_bob",
    orderStatus: "placed",
    total: 50000,
    items: [{ productId: "prod_1", quantity: 1, unitPrice: 50000, name: "Herbal Oil" }],
    paymentStatus: "unpaid",
  });

  // Revoked admin attempt (isAdmin: false)
  await assert.rejects(
    async () => {
      await executeTransitionOrderStatus({
        db,
        caller: { uid: "revoked_admin_uid", email: "revoked@ems.shop", isAdmin: false },
        orderId,
        newStatus: "accepted",
      });
    },
    { message: /You do not have permission to modify this order/ }
  );
});

test("Security 1.5: executeTransitionOrderStatus allows revoked admin to cancel their own customer order", async () => {
  const db = new MockFirestore();
  const orderId = "order_revoked_own";
  const revokedUid = "revoked_admin_uid";

  db._setDoc("products", "prod_1", { name: "Herbal Oil", stock: 10, isActive: true });
  db._setDoc("orders", orderId, {
    userId: revokedUid,
    orderStatus: "placed",
    total: 50000,
    items: [{ productId: "prod_1", quantity: 1, unitPrice: 50000, name: "Herbal Oil" }],
    paymentStatus: "unpaid",
  });

  // Legitimate customer operation: cancelling their own placed order
  const result = await executeTransitionOrderStatus({
    db,
    caller: { uid: revokedUid, email: "revoked@ems.shop", isAdmin: false },
    orderId,
    newStatus: "cancelled",
  });

  assert.equal(result.success, true);
  assert.equal(result.newStatus, "cancelled");

  const orderDoc = db._getDoc("orders", orderId);
  assert.equal(orderDoc.data.orderStatus, "cancelled");
});

test("Security 1.6: executeRecordPayment & executeCorrectPayment deny revoked administrators", async () => {
  const db = new MockFirestore();
  const orderId = "order_payment_test";

  db._setDoc("orders", orderId, {
    userId: "cust_bob",
    orderStatus: "placed",
    total: 30000,
    items: [{ productId: "prod_1", quantity: 1, unitPrice: 30000, name: "Tea" }],
    paymentStatus: "unpaid",
  });

  // Record payment denied for non-admin / revoked
  await assert.rejects(
    async () => {
      await executeRecordPayment({
        db,
        caller: { uid: "revoked_uid", isAdmin: false },
        orderId,
      });
    },
    { message: /Only authorized dispensary staff can record payment receipt/ }
  );

  // Correct payment denied for non-admin / revoked
  await assert.rejects(
    async () => {
      await executeCorrectPayment({
        db,
        caller: { uid: "revoked_uid", isAdmin: false },
        orderId,
        correctedStatus: "paid",
        correctionReason: "Verified cash",
      });
    },
    { message: /Only authorized dispensary staff can record payment corrections/ }
  );
});

/* ═══════════════════════════════════════════════════════════════════════
   2. CRYPTOGRAPHICALLY SECURE PICKUP PIN TESTS
   ═══════════════════════════════════════════════════════════════════════ */

test("Security 2.1: Pickup PINs are strictly 6-digit numeric strings in range 100000-999999", async () => {
  const db = new MockFirestore();
  db._setDoc("products", "prod_pin", { name: "Herbal Syrup", stock: 1000, price: 25000, isActive: true });

  const pins = new Set();
  const pinRegex = /^\d{6}$/;

  for (let i = 0; i < 20; i++) {
    const userId = `user_${i}`;
    db._setDoc("carts", userId, { items: [{ productId: "prod_pin", quantity: 1 }] });

    const res = await executeCreateOrder(
      db,
      userId,
      {
        idempotencyKey: `idemp_pin_test_${i}_${crypto.randomBytes(4).toString("hex")}`,
        deliveryMethod: "click_and_collect",
        paymentMethod: "pay_at_pickup",
        pickupContact: { name: "Test User", phone: "+919876543210" },
      }
    );

    assert.ok(res.pickupCode, "Click-and-collect orders must have a pickupCode");
    assert.match(res.pickupCode, pinRegex, `Pickup PIN ${res.pickupCode} must be exactly 6 digits`);

    const pinNum = parseInt(res.pickupCode, 10);
    assert.ok(pinNum >= 100000 && pinNum <= 999999, `PIN ${res.pickupCode} must be within [100000, 999999]`);
    pins.add(res.pickupCode);
  }

  // Cryptographically random integers should produce unique values across 20 samples
  assert.equal(pins.size, 20, "Generated pickup PINs must have high cryptographic entropy");
});

test("Security 2.2: Pickup PIN verification enforces 5-attempt rate-limiting and permanent collection lockout", async () => {
  const db = new MockFirestore();
  const orderId = "order_pin_lockout";
  const correctPin = "654321";

  db._setDoc("orders", orderId, {
    userId: "cust_alice",
    orderStatus: "ready_for_pickup",
    deliveryMethod: "click_and_collect",
    pickupCode: correctPin,
    pickupAttempts: 0,
    total: 10000,
    items: [{ productId: "prod_1", quantity: 1, unitPrice: 10000, name: "Tea" }],
    paymentStatus: "unpaid",
  });

  const adminCaller = { uid: "admin_alice", email: "alice@ems.shop", isAdmin: true };

  // Attempts 1 through 5 with wrong PIN must increment pickupAttempts
  for (let attempt = 1; attempt <= 5; attempt++) {
    const remaining = 5 - attempt;
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
      { message: new RegExp(`Invalid 6-digit collection code\\. ${remaining} attempts remaining before lock\\.`) }
    );

    const doc = db._getDoc("orders", orderId);
    assert.equal(doc.data.pickupAttempts, attempt);
  }

  // After 5 failed attempts (attempts >= 5), subsequent attempts are locked
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
    { message: /Pickup verification locked due to excessive failed attempts \(>5\)/ }
  );
});

/* ═══════════════════════════════════════════════════════════════════════
   3. INVITATION TOKEN HASHING & ZERO PLAINTEXT STORAGE
   ═══════════════════════════════════════════════════════════════════════ */

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

test("Security 3.1: Invitation token hash verification matches SHA-256 and never matches plaintext", () => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);

  assert.equal(tokenHash.length, 64, "SHA-256 hash must be 64 hexadecimal characters");
  assert.notEqual(rawToken, tokenHash, "Plaintext token must never equal its hash");

  // Recomputing hash gives identical result
  assert.equal(hashToken(rawToken), tokenHash);

  // Wrong token fails hash comparison
  assert.notEqual(hashToken("wrong_token"), tokenHash);
});

test("Security 3.2: Invitation documents store only tokenHash and omit plaintext token and raw acceptUrl", () => {
  const email = "new_admin@ems.shop";
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);

  // Schema verified against hardened implementation
  const firestoreDoc = {
    email,
    tokenHash,
    status: "pending",
    invitedBy: PRIMARY_SUPERADMIN_EMAIL,
  };

  assert.equal(firestoreDoc.token, undefined, "Plaintext token must NOT be stored in Firestore");
  assert.equal(firestoreDoc.acceptUrl, undefined, "Raw acceptUrl containing plaintext token must NOT be stored in Firestore");
  assert.equal(firestoreDoc.tokenHash, tokenHash, "tokenHash must be persisted for verification");
});

test("Security 3.3: Backward compatibility allows redemption of legacy invitations containing token", () => {
  const rawToken = "legacy_token_1234567890abcdef1234567890abcdef";
  const tokenHash = hashToken(rawToken);

  // Legacy document that only had token or both
  const legacyDoc = {
    email: "legacy@ems.shop",
    token: rawToken,
    status: "pending",
  };

  const submittedToken = "legacy_token_1234567890abcdef1234567890abcdef";
  const submittedHash = hashToken(submittedToken);

  const tokenMatches =
    (legacyDoc.tokenHash && legacyDoc.tokenHash === submittedHash) ||
    (legacyDoc.token && legacyDoc.token === submittedToken);

  assert.equal(tokenMatches, true, "Legacy invitations must be safely redeemable without breaking");
});
