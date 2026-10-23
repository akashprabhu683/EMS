import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeAuditData, buildAuditPayload } from "../lib/audit.js";
import { formatIstDateKey, computeOperationalReport, STORE_TIMEZONE } from "../lib/reports.js";
import { executeTransitionOrderStatus, executeRecordPayment, executeCorrectPayment } from "../lib/orders.js";

/* ═══════════════════════════════════════════════════════════════════════
   IN-MEMORY MOCK FIRESTORE FOR OPERATIONAL REPORTING & AUDIT TESTING
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
    collMap.set(id, { data: JSON.parse(JSON.stringify(data)) });
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
          async set(data) {
            firestore._setDoc(collName, docId, data);
          },
          async update(patch) {
            const entry = firestore._getDoc(collName, docId);
            if (!entry) throw new Error("Document does not exist");
            const merged = { ...entry.data, ...patch };
            firestore._setDoc(collName, docId, merged);
          },
        };
      },
      async get() {
        if (!firestore.store.has(collName)) firestore.store.set(collName, new Map());
        const collMap = firestore.store.get(collName);
        const docs = Array.from(collMap.entries()).map(([id, entry]) => ({
          id,
          exists: true,
          data: () => JSON.parse(JSON.stringify(entry.data)),
        }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
  }

  async runTransaction(updateFn) {
    const firestore = this;
    const reads = new Map();
    const writes = [];

    const transaction = {
      async get(docRef) {
        const parts = docRef.path.split("/");
        const coll = parts[0];
        const id = parts[1];
        const entry = firestore._getDoc(coll, id);
        reads.set(docRef.path, entry ? JSON.parse(JSON.stringify(entry.data)) : undefined);
        return {
          exists: !!entry,
          id,
          ref: docRef,
          data: () => (entry ? JSON.parse(JSON.stringify(entry.data)) : undefined),
        };
      },
      set(docRef, data) {
        writes.push({ type: "set", path: docRef.path, data: JSON.parse(JSON.stringify(data)) });
      },
      update(docRef, patch) {
        writes.push({ type: "update", path: docRef.path, patch: JSON.parse(JSON.stringify(patch)) });
      },
      delete(docRef) {
        writes.push({ type: "delete", path: docRef.path });
      },
    };

    const result = await updateFn(transaction);

    for (const op of writes) {
      const parts = op.path.split("/");
      const coll = parts[0];
      const id = parts[1];
      if (op.type === "set") {
        firestore._setDoc(coll, id, op.data);
      } else if (op.type === "update") {
        const existing = firestore._getDoc(coll, id);
        const merged = { ...(existing ? existing.data : {}), ...op.patch };
        firestore._setDoc(coll, id, merged);
      } else if (op.type === "delete") {
        if (firestore.store.has(coll)) firestore.store.get(coll).delete(id);
      }
    }

    return result;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   TEST CASES FOR PHASE 5
   ═══════════════════════════════════════════════════════════════════════ */

test("1. Audit log data sanitization strips PII and secret tokens", () => {
  const sensitiveInput = {
    customerName: "Ravi Kumar",
    phone: "9876543210",
    mobile: "+91-9876543210",
    token: "secret_token_12345",
    nested: {
      password: "SuperSecretPassword!",
      orderRef: "ORD_999",
    },
  };

  const sanitized = sanitizeAuditData(sensitiveInput);
  assert.equal(sanitized.phone, "[REDACTED]");
  assert.equal(sanitized.mobile, "[REDACTED]");
  assert.equal(sanitized.token, "[REDACTED]");
  assert.equal(sanitized.nested.password, "[REDACTED]");
  assert.equal(sanitized.nested.orderRef, "ORD_999");
  assert.equal(sanitized.customerName, "Ravi Kumar");
});

test("2. Order status transitions write append-only audit trail atomically", async () => {
  const db = new MockFirestore();
  db._setDoc("orders", "order_101", {
    orderStatus: "placed",
    userId: "cust_123",
    total: 45000,
  });

  const caller = { uid: "admin_1", email: "staff@thangamstores.com", isAdmin: true };
  const res = await executeTransitionOrderStatus({
    db,
    caller,
    orderId: "order_101",
    newStatus: "accepted",
  });

  assert.equal(res.success, true);
  assert.equal(res.newStatus, "accepted");

  // Verify that an audit log entry was written
  const auditEntries = Array.from(db.store.get("audit_logs")?.values() || []);
  assert.equal(auditEntries.length, 1);
  const log = auditEntries[0].data;
  assert.equal(log.action, "ORDER_STATUS_CHANGED");
  assert.equal(log.actor.email, "staff@thangamstores.com");
  assert.equal(log.target.id, "order_101");
  assert.equal(log.changes[0].before, "placed");
  assert.equal(log.changes[0].after, "accepted");
});

test("3. Collection verification PIN entry records ORDER_COLLECTED audit log", async () => {
  const db = new MockFirestore();
  db._setDoc("orders", "order_202", {
    orderStatus: "ready_for_pickup",
    pickupCode: "789123",
    userId: "cust_456",
    total: 30000,
  });

  const caller = { uid: "admin_2", email: "counter@thangamstores.com", isAdmin: true };
  const res = await executeTransitionOrderStatus({
    db,
    caller,
    orderId: "order_202",
    newStatus: "collected",
    pickupCode: "789123",
  });

  assert.equal(res.success, true);
  assert.equal(res.pickupVerified, true);

  const auditEntries = Array.from(db.store.get("audit_logs")?.values() || []);
  assert.equal(auditEntries.length, 1);
  const log = auditEntries[0].data;
  assert.equal(log.action, "ORDER_COLLECTED");
  assert.match(log.summary, /collected and verified with 6-digit PIN/);
  assert.equal(log.actor.email, "counter@thangamstores.com");
});

test("4. Payment recording writes PAYMENT_RECORDED audit trail without changing orderStatus", async () => {
  const db = new MockFirestore();
  db._setDoc("orders", "order_303", {
    orderStatus: "ready_for_pickup",
    paymentStatus: "unpaid",
    total: 25000,
  });

  const caller = { uid: "admin_3", email: "cashier@thangamstores.com", isAdmin: true };
  const res = await executeRecordPayment({
    db,
    caller,
    orderId: "order_303",
    note: "Cash received ₹250 at counter.",
  });

  assert.equal(res.success, true);
  assert.equal(res.paymentStatus, "paid");

  // Verify orderStatus remains unaffected
  const orderDoc = db._getDoc("orders", "order_303").data;
  assert.equal(orderDoc.orderStatus, "ready_for_pickup");
  assert.equal(orderDoc.paymentStatus, "paid");

  const auditEntries = Array.from(db.store.get("audit_logs")?.values() || []);
  assert.equal(auditEntries.length, 1);
  const log = auditEntries[0].data;
  assert.equal(log.action, "PAYMENT_RECORDED");
  assert.equal(log.changes[0].before, "unpaid");
  assert.equal(log.changes[0].after, "paid");
});

test("5. Payment correction writes PAYMENT_CORRECTED audit trail with reason", async () => {
  const db = new MockFirestore();
  db._setDoc("orders", "order_404", {
    orderStatus: "ready_for_pickup",
    paymentStatus: "paid",
    total: 50000,
  });

  const caller = { uid: "admin_super", email: "akashprabhu0302@gmail.com", isAdmin: true };
  const res = await executeCorrectPayment({
    db,
    caller,
    orderId: "order_404",
    correctedStatus: "unpaid",
    correctionReason: "UPI counter transaction timed out and was not settled by bank.",
  });

  assert.equal(res.success, true);
  assert.equal(res.correctedStatus, "unpaid");

  const orderDoc = db._getDoc("orders", "order_404").data;
  assert.equal(orderDoc.paymentStatus, "unpaid");
  assert.equal(orderDoc.paymentCorrectionReason, "UPI counter transaction timed out and was not settled by bank.");

  const auditEntries = Array.from(db.store.get("audit_logs")?.values() || []);
  assert.equal(auditEntries.length, 1);
  const log = auditEntries[0].data;
  assert.equal(log.action, "PAYMENT_CORRECTED");
  assert.match(log.summary, /UPI counter transaction timed out/);
});

test("6. IST timezone calendar date mapping formats dates accurately", () => {
  // 2026-10-23 20:00:00 UTC = 2026-10-24 01:30:00 IST (+5:30)
  const utcDate = new Date("2026-10-23T20:00:00Z");
  const istDateKey = formatIstDateKey(utcDate);
  assert.equal(istDateKey, "2026-10-24");
});

test("7. Operational report accurately distinguishes Order Value from Confirmed Cash and Outstanding", async () => {
  const db = new MockFirestore();

  // Order 1: Placed, unpaid, ₹100
  db._setDoc("orders", "ord_1", {
    orderStatus: "placed",
    paymentStatus: "unpaid",
    total: 10000,
    createdAt: "2026-10-24T05:00:00Z",
  });

  // Order 2: Accepted, unpaid, ₹200
  db._setDoc("orders", "ord_2", {
    orderStatus: "accepted",
    paymentStatus: "unpaid",
    total: 20000,
    createdAt: "2026-10-24T06:00:00Z",
  });

  // Order 3: Collected, PAID, ₹300
  db._setDoc("orders", "ord_3", {
    orderStatus: "collected",
    paymentStatus: "paid",
    total: 30000,
    paidAt: "2026-10-24T07:00:00Z",
    paidConfirmedBy: "staff@thangamstores.com",
    createdAt: "2026-10-24T06:30:00Z",
  });

  // Order 4: Cancelled, unpaid, ₹150 (must NOT be counted in revenue or pipeline)
  db._setDoc("orders", "ord_4", {
    orderStatus: "cancelled",
    paymentStatus: "unpaid",
    total: 15000,
    createdAt: "2026-10-24T04:00:00Z",
  });

  // Product 1: In stock
  db._setDoc("products", "p_1", {
    name: "Herbal Balm",
    stock: 20,
    lowStockThreshold: 5,
    price: 15000,
  });

  // Product 2: Low stock (threshold 10, current 6)
  db._setDoc("products", "p_2", {
    name: "Chyawanprash",
    stock: 6,
    lowStockThreshold: 10,
    price: 35000,
  });

  // Product 3: Out of stock
  db._setDoc("products", "p_3", {
    name: "Ashwagandha Powder",
    stock: 0,
    lowStockThreshold: 5,
    price: 20000,
  });

  const report = await computeOperationalReport(db);

  // Order counts
  assert.equal(report.orders.totalOrders, 4);
  assert.equal(report.orders.activeOrders, 3);
  assert.equal(report.orders.placed.count, 1);
  assert.equal(report.orders.awaitingPreparation.count, 1);
  assert.equal(report.orders.collected.count, 1);
  assert.equal(report.orders.cancelled.count, 1);

  // Financial metrics
  // Confirmed cash is ONLY ord_3: ₹300 (30000 paise)
  assert.equal(report.financials.confirmedCashPaise, 30000);
  assert.equal(report.financials.confirmedCashRupees, 300);

  // Outstanding unpaid is ord_1 + ord_2: ₹100 + ₹200 = ₹300
  assert.equal(report.financials.outstandingUnpaidPaise, 30000);
  assert.equal(report.financials.outstandingUnpaidRupees, 300);

  // Gross pipeline is ord_1 + ord_2 + ord_3: ₹600 (cancelled excluded)
  assert.equal(report.financials.grossPipelinePaise, 60000);
  assert.equal(report.financials.grossPipelineRupees, 600);

  // Cancelled amount
  assert.equal(report.financials.cancelledPaise, 15000);
  assert.equal(report.financials.cancelledRupees, 150);

  // Inventory analysis
  assert.equal(report.inventory.totalCatalogItems, 3);
  assert.equal(report.inventory.inStockItems, 1);
  assert.equal(report.inventory.lowStockItems, 1);
  assert.equal(report.inventory.outOfStockItems, 1);
  assert.equal(report.inventory.lowStockAlerts.length, 2);
  // Out of stock comes first in alerts
  assert.equal(report.inventory.lowStockAlerts[0].name, "Ashwagandha Powder");
  assert.equal(report.inventory.lowStockAlerts[0].currentStock, 0);

  // Daily collections breakdown
  assert.equal(report.dailyCollections.length, 1);
  assert.equal(report.dailyCollections[0].date, "2026-10-24");
  assert.equal(report.dailyCollections[0].cashCollectedRupees, 300);
  assert.equal(report.dailyCollections[0].staffActors.includes("staff@thangamstores.com"), true);
});

test("8. Reconciliation detects collected orders with unpaid payment status and discrepancies", async () => {
  const db = new MockFirestore();

  // Discrepancy 1: Collected without payment
  db._setDoc("orders", "ord_unpaid_collected", {
    orderStatus: "collected",
    paymentStatus: "unpaid",
    total: 40000,
    createdAt: "2026-10-24T08:00:00Z",
  });

  // Discrepancy 2: Cancelled order marked paid
  db._setDoc("orders", "ord_paid_cancelled", {
    orderStatus: "cancelled",
    paymentStatus: "paid",
    total: 20000,
    createdAt: "2026-10-24T08:00:00Z",
  });

  // Discrepancy 3: Cancelled order with inventory not restored
  db._setDoc("orders", "ord_unrestored", {
    orderStatus: "cancelled",
    paymentStatus: "unpaid",
    inventoryDeducted: true,
    inventoryRestored: false,
    total: 10000,
    createdAt: "2026-10-24T08:00:00Z",
  });

  const report = await computeOperationalReport(db);

  assert.equal(report.reconciliation.discrepancyCount, 3);
  const types = report.reconciliation.discrepancies.map(d => d.type);
  assert.equal(types.includes("UNPAID_COLLECTION"), true);
  assert.equal(types.includes("PAID_CANCELLED"), true);
  assert.equal(types.includes("UNRESTORED_INVENTORY"), true);
});
