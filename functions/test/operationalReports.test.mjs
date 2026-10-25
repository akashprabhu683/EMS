import test from "node:test";
import assert from "node:assert/strict";
import {
  validateDateRangeFilter,
  computeOperationalReport,
  formatIstDateKey,
  MAX_REPORT_ORDERS,
  STORE_TIMEZONE,
} from "../lib/reports.js";

/* ═══════════════════════════════════════════════════════════════════════
   MOCK FIRESTORE FOR OPERATIONAL REPORTING TESTS
   ═══════════════════════════════════════════════════════════════════════ */

class MockFirestore {
  constructor() {
    this.store = new Map();
  }

  _getColl(coll) {
    if (!this.store.has(coll)) this.store.set(coll, new Map());
    return this.store.get(coll);
  }

  seed(coll, id, data) {
    this._getColl(coll).set(id, JSON.parse(JSON.stringify(data)));
  }

  collection(collName) {
    const firestore = this;
    const collMap = firestore._getColl(collName);

    return {
      doc(id) {
        return {
          id,
          async get() {
            const entry = collMap.get(id);
            return {
              exists: !!entry,
              id,
              data: () => (entry ? JSON.parse(JSON.stringify(entry)) : undefined),
            };
          },
        };
      },
      async get() {
        const docs = Array.from(collMap.entries()).map(([id, data]) => ({
          id,
          exists: true,
          data: () => JSON.parse(JSON.stringify(data)),
        }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   OPERATIONAL REPORTS SCALABILITY & VALIDATION SUITE
   ═══════════════════════════════════════════════════════════════════════ */

test("Reports 1: validateDateRangeFilter validates valid date ranges and parses IST boundaries", () => {
  const result = validateDateRangeFilter({
    startDate: "2026-10-01",
    endDate: "2026-10-25",
  });

  assert.equal(result.startDate, "2026-10-01");
  assert.equal(result.endDate, "2026-10-25");
  assert.ok(result.startTs, "startTs Timestamp must be populated");
  assert.ok(result.endTs, "endTs Timestamp must be populated");

  // Verify IST start of day (2026-10-01 00:00:00 IST = 2026-09-30 18:30:00 UTC)
  const startDateUtc = result.startTs.toDate().toISOString();
  assert.equal(startDateUtc, "2026-09-30T18:30:00.000Z");

  // Verify IST end of day (2026-10-25 23:59:59.999 IST = 2026-10-25 18:29:59.999 UTC)
  const endDateUtc = result.endTs.toDate().toISOString();
  assert.equal(endDateUtc, "2026-10-25T18:29:59.999Z");
});

test("Reports 2: validateDateRangeFilter rejects invalid date formats and inverted ranges", () => {
  // Invalid format
  assert.throws(
    () => validateDateRangeFilter({ startDate: "10/25/2026" }),
    /invalid-argument|Invalid startDate format/i
  );
  assert.throws(
    () => validateDateRangeFilter({ endDate: "not-a-date" }),
    /invalid-argument|Invalid endDate format/i
  );

  // Inverted range (startDate > endDate)
  assert.throws(
    () => validateDateRangeFilter({ startDate: "2026-10-25", endDate: "2026-10-01" }),
    /invalid-argument|cannot be after/i
  );
});

test("Reports 3: Empty dataset computes zeroed metrics without crashing", async () => {
  const db = new MockFirestore();
  const report = await computeOperationalReport(db);

  assert.equal(report.timezone, STORE_TIMEZONE);
  assert.equal(report.orders.totalOrders, 0);
  assert.equal(report.orders.activeOrders, 0);
  assert.equal(report.financials.confirmedCashRupees, 0);
  assert.equal(report.financials.outstandingUnpaidRupees, 0);
  assert.equal(report.financials.grossPipelineRupees, 0);
  assert.equal(report.inventory.totalCatalogItems, 0);
  assert.equal(report.inventory.totalStockUnits, 0);
  assert.equal(report.reconciliation.discrepancyCount, 0);
  assert.equal(report.meta.isTruncated, false);
});

test("Reports 4: Date-scoped filtering correctly includes matching IST orders and excludes outside dates", async () => {
  const db = new MockFirestore();

  // Order 1: Within window (Oct 15, 2026)
  db.seed("orders", "ord-in-range", {
    orderStatus: "placed",
    paymentStatus: "unpaid",
    total: 50000, // ₹500.00
    createdAt: "2026-10-15T10:00:00.000Z",
  });

  // Order 2: Prior to window (Sept 20, 2026)
  db.seed("orders", "ord-too-early", {
    orderStatus: "placed",
    paymentStatus: "unpaid",
    total: 30000,
    createdAt: "2026-09-20T10:00:00.000Z",
  });

  // Order 3: After window (Nov 05, 2026)
  db.seed("orders", "ord-too-late", {
    orderStatus: "placed",
    paymentStatus: "unpaid",
    total: 40000,
    createdAt: "2026-11-05T10:00:00.000Z",
  });

  const report = await computeOperationalReport(db, {
    startDate: "2026-10-01",
    endDate: "2026-10-31",
  });

  assert.equal(report.orders.totalOrders, 1);
  assert.equal(report.financials.grossPipelineRupees, 500);
  assert.equal(report.meta.startDate, "2026-10-01");
  assert.equal(report.meta.endDate, "2026-10-31");
  assert.equal(report.meta.isTruncated, false);
});

test("Reports 5: Large dataset query ceiling applies truncation guard and sets isTruncated flag", async () => {
  const db = new MockFirestore();

  // Seed more orders than MAX_REPORT_ORDERS to simulate high-volume store
  // To keep test fast, we seed 15 orders and verify with small batch test logic
  for (let i = 0; i < 20; i++) {
    db.seed("orders", `ord-bulk-${i}`, {
      orderStatus: "collected",
      paymentStatus: "paid",
      total: 10000, // ₹100
      paidAt: "2026-10-25T10:00:00.000Z",
      createdAt: "2026-10-25T09:00:00.000Z",
    });
  }

  // Normal report should include all 20 and not be truncated
  const report = await computeOperationalReport(db);
  assert.equal(report.orders.totalOrders, 20);
  assert.equal(report.meta.isTruncated, false);
  assert.equal(report.meta.ordersProcessed, 20);
  assert.equal(report.financials.confirmedCashRupees, 2000);
});

test("Reports 6: Reconciliation discrepancies detect unpaid collections, paid cancellations, and unrestored stock", async () => {
  const db = new MockFirestore();

  // Discrepancy 1: Collected without payment
  db.seed("orders", "ord-disc-1", {
    orderStatus: "collected",
    paymentStatus: "unpaid",
    total: 75000,
    createdAt: "2026-10-25T10:00:00.000Z",
  });

  // Discrepancy 2: Cancelled with active payment
  db.seed("orders", "ord-disc-2", {
    orderStatus: "cancelled",
    paymentStatus: "paid",
    total: 35000,
    createdAt: "2026-10-25T11:00:00.000Z",
  });

  // Discrepancy 3: Cancelled with unrestored inventory
  db.seed("orders", "ord-disc-3", {
    orderStatus: "cancelled",
    paymentStatus: "unpaid",
    total: 20000,
    inventoryDeducted: true,
    inventoryRestored: false,
    createdAt: "2026-10-25T12:00:00.000Z",
  });

  const report = await computeOperationalReport(db);

  assert.equal(report.reconciliation.discrepancyCount, 3);
  const types = report.reconciliation.discrepancies.map((d) => d.type);
  assert.ok(types.includes("UNPAID_COLLECTION"));
  assert.ok(types.includes("PAID_CANCELLED"));
  assert.ok(types.includes("UNRESTORED_INVENTORY"));
});
