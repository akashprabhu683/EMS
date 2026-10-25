import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

export const STORE_TIMEZONE = "Asia/Kolkata";
export const MAX_REPORT_ORDERS = 5000;
export const MAX_CATALOG_ITEMS = 2000;
export const PRIMARY_SUPERADMIN_EMAIL = "akashprabhu0302@gmail.com";

export interface DateRangeFilter {
  startDate?: string; // YYYY-MM-DD or ISO
  endDate?: string;   // YYYY-MM-DD or ISO
}

export interface OperationalReportData {
  generatedAt: string;
  timezone: string;
  meta: {
    isTruncated: boolean;
    ordersProcessed: number;
    maxOrdersCeiling: number;
    startDate?: string;
    endDate?: string;
    warning?: string;
  };
  orders: {
    totalOrders: number;
    activeOrders: number;
    placed: { count: number; totalPaise: number };
    awaitingPreparation: { count: number; totalPaise: number }; // accepted
    inPreparation: { count: number; totalPaise: number };       // preparing
    readyForPickup: { count: number; totalPaise: number };      // ready_for_pickup
    collected: { count: number; totalPaise: number };           // collected
    cancelled: { count: number; totalPaise: number };           // cancelled
  };
  financials: {
    confirmedCashPaise: number;
    confirmedCashRupees: number;
    outstandingUnpaidPaise: number;
    outstandingUnpaidRupees: number;
    grossPipelinePaise: number;
    grossPipelineRupees: number;
    cancelledPaise: number;
    cancelledRupees: number;
    confirmedPaymentsCount: number;
  };
  dailyCollections: {
    date: string; // YYYY-MM-DD in IST
    ordersCollected: number;
    cashCollectedPaise: number;
    cashCollectedRupees: number;
    staffActors: string[];
  }[];
  inventory: {
    totalCatalogItems: number;
    inStockItems: number;
    lowStockItems: number;
    outOfStockItems: number;
    totalStockUnits: number;
    totalStockValuationPaise: number;
    totalStockValuationRupees: number;
    lowStockAlerts: {
      productId: string;
      name: string;
      currentStock: number;
      threshold: number;
      pricePaise: number;
    }[];
  };
  reconciliation: {
    discrepancyCount: number;
    discrepancies: {
      type: "UNPAID_COLLECTION" | "PAID_CANCELLED" | "UNRESTORED_INVENTORY";
      severity: "high" | "warning";
      orderId: string;
      description: string;
    }[];
  };
}

/**
 * Converts a Date or ISO string into a YYYY-MM-DD string in the specified timezone (Asia/Kolkata).
 */
export function formatIstDateKey(dateInput: Date | string): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Validates date range input parameters and converts them to precise IST day boundaries.
 */
export function validateDateRangeFilter(filter?: DateRangeFilter): {
  startDate?: string;
  endDate?: string;
  startTs?: admin.firestore.Timestamp;
  endTs?: admin.firestore.Timestamp;
} {
  if (!filter || (!filter.startDate && !filter.endDate)) {
    return {};
  }

  const { startDate, endDate } = filter;
  const ISO_OR_YMD_REGEX = /^\d{4}-\d{2}-\d{2}(T.*)?$/;

  if (startDate && !ISO_OR_YMD_REGEX.test(startDate.trim())) {
    throw new HttpsError(
      "invalid-argument",
      `Invalid startDate format: '${startDate}'. Expected YYYY-MM-DD or ISO 8601 string.`
    );
  }
  if (endDate && !ISO_OR_YMD_REGEX.test(endDate.trim())) {
    throw new HttpsError(
      "invalid-argument",
      `Invalid endDate format: '${endDate}'. Expected YYYY-MM-DD or ISO 8601 string.`
    );
  }

  const cleanStart = startDate ? startDate.trim().split("T")[0] : undefined;
  const cleanEnd = endDate ? endDate.trim().split("T")[0] : undefined;

  if (cleanStart && cleanEnd && cleanStart > cleanEnd) {
    throw new HttpsError(
      "invalid-argument",
      `Invalid date range: startDate ('${cleanStart}') cannot be after endDate ('${cleanEnd}').`
    );
  }

  let startTs: admin.firestore.Timestamp | undefined;
  let endTs: admin.firestore.Timestamp | undefined;

  if (cleanStart) {
    const startIst = new Date(`${cleanStart}T00:00:00.000+05:30`);
    if (isNaN(startIst.getTime())) {
      throw new HttpsError("invalid-argument", `Unparseable startDate: '${startDate}'.`);
    }
    startTs = admin.firestore.Timestamp.fromDate(startIst);
  }

  if (cleanEnd) {
    const endIst = new Date(`${cleanEnd}T23:59:59.999+05:30`);
    if (isNaN(endIst.getTime())) {
      throw new HttpsError("invalid-argument", `Unparseable endDate: '${endDate}'.`);
    }
    endTs = admin.firestore.Timestamp.fromDate(endIst);
  }

  return {
    startDate: cleanStart,
    endDate: cleanEnd,
    startTs,
    endTs,
  };
}

/**
 * Computes the operational & financial reporting metrics using bounded, date-scoped Firestore records.
 */
export async function computeOperationalReport(
  db: FirebaseFirestore.Firestore,
  filter?: DateRangeFilter
): Promise<OperationalReportData> {
  const dateBounds = validateDateRangeFilter(filter);

  // 1. Fetch Orders with Date Scoping & Pagination Guard
  const ordersColl = db.collection("orders");
  const hasAdvancedQueries = typeof (ordersColl as any).where === "function" && typeof (ordersColl as any).limit === "function";

  let ordersDocs: Array<{ id: string; data: () => any }> = [];
  let isTruncated = false;

  if (hasAdvancedQueries) {
    let q: any = ordersColl;
    if (dateBounds.startTs) {
      q = q.where("createdAt", ">=", dateBounds.startTs);
    }
    if (dateBounds.endTs) {
      q = q.where("createdAt", "<=", dateBounds.endTs);
    }
    q = q.orderBy("createdAt", "desc");

    const BATCH_SIZE = 500;
    let lastDoc: any = null;

    while (ordersDocs.length < MAX_REPORT_ORDERS) {
      const fetchLimit = Math.min(BATCH_SIZE, MAX_REPORT_ORDERS - ordersDocs.length);
      let pageQuery = q.limit(fetchLimit);
      if (lastDoc) {
        pageQuery = pageQuery.startAfter(lastDoc);
      }

      const snap = await pageQuery.get();
      if (!snap.docs || snap.docs.length === 0) break;

      ordersDocs.push(...snap.docs);
      lastDoc = snap.docs[snap.docs.length - 1];

      if (snap.docs.length < fetchLimit) break;
    }

    if (ordersDocs.length >= MAX_REPORT_ORDERS && lastDoc) {
      const probeNext = await q.startAfter(lastDoc).limit(1).get();
      if (probeNext && probeNext.docs && probeNext.docs.length > 0) {
        isTruncated = true;
      }
    }
  } else {
    // In-memory fallback for mock test databases
    const rawSnap = await ordersColl.get();
    const allDocs = rawSnap.docs || [];
    const filtered: Array<{ id: string; data: () => any }> = [];

    for (const doc of allDocs) {
      const o = doc.data();
      const createdAtIso = o.createdAt?.toDate ? o.createdAt.toDate().toISOString() : o.createdAt;
      if (dateBounds.startDate || dateBounds.endDate) {
        if (createdAtIso) {
          const orderDateKey = formatIstDateKey(createdAtIso);
          if (dateBounds.startDate && orderDateKey < dateBounds.startDate) continue;
          if (dateBounds.endDate && orderDateKey > dateBounds.endDate) continue;
        }
      }
      filtered.push(doc);
    }

    if (filtered.length > MAX_REPORT_ORDERS) {
      isTruncated = true;
      ordersDocs = filtered.slice(0, MAX_REPORT_ORDERS);
    } else {
      ordersDocs = filtered;
    }
  }

  // 2. Fetch Catalog Products (Bounded)
  const productsColl = db.collection("products");
  const productsSnap = typeof (productsColl as any).limit === "function"
    ? await (productsColl as any).limit(MAX_CATALOG_ITEMS).get()
    : await productsColl.get();

  const report: OperationalReportData = {
    generatedAt: new Date().toISOString(),
    timezone: STORE_TIMEZONE,
    meta: {
      isTruncated,
      ordersProcessed: ordersDocs.length,
      maxOrdersCeiling: MAX_REPORT_ORDERS,
      startDate: dateBounds.startDate,
      endDate: dateBounds.endDate,
      warning: isTruncated
        ? `Report exceeded maximum query ceiling of ${MAX_REPORT_ORDERS} orders. Displaying the latest ${MAX_REPORT_ORDERS} orders. Please select a narrower date range for complete metrics.`
        : undefined,
    },
    orders: {
      totalOrders: 0,
      activeOrders: 0,
      placed: { count: 0, totalPaise: 0 },
      awaitingPreparation: { count: 0, totalPaise: 0 },
      inPreparation: { count: 0, totalPaise: 0 },
      readyForPickup: { count: 0, totalPaise: 0 },
      collected: { count: 0, totalPaise: 0 },
      cancelled: { count: 0, totalPaise: 0 },
    },
    financials: {
      confirmedCashPaise: 0,
      confirmedCashRupees: 0,
      outstandingUnpaidPaise: 0,
      outstandingUnpaidRupees: 0,
      grossPipelinePaise: 0,
      grossPipelineRupees: 0,
      cancelledPaise: 0,
      cancelledRupees: 0,
      confirmedPaymentsCount: 0,
    },
    dailyCollections: [],
    inventory: {
      totalCatalogItems: 0,
      inStockItems: 0,
      lowStockItems: 0,
      outOfStockItems: 0,
      totalStockUnits: 0,
      totalStockValuationPaise: 0,
      totalStockValuationRupees: 0,
      lowStockAlerts: [],
    },
    reconciliation: {
      discrepancyCount: 0,
      discrepancies: [],
    },
  };

  const dailyMap = new Map<string, { collectedCount: number; cashPaise: number; actors: Set<string> }>();

  // 3. Process Orders
  for (const doc of ordersDocs) {
    const o = doc.data();
    const orderId = doc.id;
    const status = String(o.orderStatus || "placed");
    const paymentStatus = String(o.paymentStatus || "unpaid");
    const total = Number(o.total || o.totalPaise || 0);

    const createdAtIso = o.createdAt?.toDate ? o.createdAt.toDate().toISOString() : o.createdAt;

    // Redundant guard if in-memory filtering was used or for date key accuracy
    if (dateBounds.startDate || dateBounds.endDate) {
      if (createdAtIso) {
        const orderDateKey = formatIstDateKey(createdAtIso);
        if (dateBounds.startDate && orderDateKey < dateBounds.startDate) continue;
        if (dateBounds.endDate && orderDateKey > dateBounds.endDate) continue;
      }
    }

    report.orders.totalOrders++;

    // Categorize by status
    switch (status) {
      case "placed":
        report.orders.placed.count++;
        report.orders.placed.totalPaise += total;
        report.orders.activeOrders++;
        report.financials.grossPipelinePaise += total;
        break;
      case "accepted":
        report.orders.awaitingPreparation.count++;
        report.orders.awaitingPreparation.totalPaise += total;
        report.orders.activeOrders++;
        report.financials.grossPipelinePaise += total;
        break;
      case "preparing":
        report.orders.inPreparation.count++;
        report.orders.inPreparation.totalPaise += total;
        report.orders.activeOrders++;
        report.financials.grossPipelinePaise += total;
        break;
      case "ready_for_pickup":
        report.orders.readyForPickup.count++;
        report.orders.readyForPickup.totalPaise += total;
        report.orders.activeOrders++;
        report.financials.grossPipelinePaise += total;
        break;
      case "collected":
        report.orders.collected.count++;
        report.orders.collected.totalPaise += total;
        report.orders.activeOrders++;
        report.financials.grossPipelinePaise += total;
        break;
      case "cancelled":
        report.orders.cancelled.count++;
        report.orders.cancelled.totalPaise += total;
        report.financials.cancelledPaise += total;
        break;
      default:
        report.orders.activeOrders++;
        report.financials.grossPipelinePaise += total;
    }

    // Process actual counter cash payments
    if (paymentStatus === "paid") {
      report.financials.confirmedCashPaise += total;
      report.financials.confirmedPaymentsCount++;

      // Daily aggregation based on payment date in IST
      const paidDateSource = o.paidAt?.toDate
        ? o.paidAt.toDate()
        : o.paidAt
        ? new Date(o.paidAt)
        : createdAtIso
        ? new Date(createdAtIso)
        : new Date();
      const dateKey = formatIstDateKey(paidDateSource);

      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { collectedCount: 0, cashPaise: 0, actors: new Set() });
      }
      const dayEntry = dailyMap.get(dateKey)!;
      dayEntry.cashPaise += total;
      if (status === "collected") {
        dayEntry.collectedCount++;
      }
      if (o.paidConfirmedBy) {
        dayEntry.actors.add(String(o.paidConfirmedBy));
      }
    } else if (status !== "cancelled") {
      report.financials.outstandingUnpaidPaise += total;
    }

    // 4. Reconciliation & Integrity Checks
    // Discrepancy 1: Collected but unpaid
    if (status === "collected" && paymentStatus !== "paid") {
      report.reconciliation.discrepancies.push({
        type: "UNPAID_COLLECTION",
        severity: "warning",
        orderId,
        description: `Order ${orderId} was marked collected, but in-person payment (₹${(total / 100).toFixed(2)}) is still pending confirmation.`,
      });
    }

    // Discrepancy 2: Paid but cancelled
    if (status === "cancelled" && paymentStatus === "paid") {
      report.reconciliation.discrepancies.push({
        type: "PAID_CANCELLED",
        severity: "high",
        orderId,
        description: `Order ${orderId} is cancelled, but has an active counter payment of ₹${(total / 100).toFixed(2)} recorded. Check counter refund status.`,
      });
    }

    // Discrepancy 3: Cancelled without inventory restoration
    if (status === "cancelled" && o.inventoryDeducted && !o.inventoryRestored) {
      report.reconciliation.discrepancies.push({
        type: "UNRESTORED_INVENTORY",
        severity: "warning",
        orderId,
        description: `Order ${orderId} was cancelled but catalog inventory has not been reconciled back to stock.`,
      });
    }
  }

  report.financials.confirmedCashRupees = report.financials.confirmedCashPaise / 100;
  report.financials.outstandingUnpaidRupees = report.financials.outstandingUnpaidPaise / 100;
  report.financials.grossPipelineRupees = report.financials.grossPipelinePaise / 100;
  report.financials.cancelledRupees = report.financials.cancelledPaise / 100;
  report.reconciliation.discrepancyCount = report.reconciliation.discrepancies.length;

  // Format daily collections table
  report.dailyCollections = Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      ordersCollected: data.collectedCount,
      cashCollectedPaise: data.cashPaise,
      cashCollectedRupees: data.cashPaise / 100,
      staffActors: Array.from(data.actors),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  // 5. Process Product Catalog & Configurable Stock Alerts
  const productDocs = productsSnap.docs || [];
  for (const doc of productDocs) {
    const p = doc.data();
    const stock = Number(p.stock ?? 0);
    const threshold = Number(p.lowStockThreshold ?? 5);
    const pricePaise = Number(p.price ?? 0);

    report.inventory.totalCatalogItems++;
    report.inventory.totalStockUnits += stock;
    report.inventory.totalStockValuationPaise += stock * pricePaise;

    if (stock === 0) {
      report.inventory.outOfStockItems++;
      report.inventory.lowStockAlerts.push({
        productId: doc.id,
        name: String(p.name || doc.id),
        currentStock: 0,
        threshold,
        pricePaise,
      });
    } else if (stock <= threshold) {
      report.inventory.lowStockItems++;
      report.inventory.lowStockAlerts.push({
        productId: doc.id,
        name: String(p.name || doc.id),
        currentStock: stock,
        threshold,
        pricePaise,
      });
    } else {
      report.inventory.inStockItems++;
    }
  }

  report.inventory.totalStockValuationRupees = report.inventory.totalStockValuationPaise / 100;
  report.inventory.lowStockAlerts.sort((a, b) => a.currentStock - b.currentStock);

  return report;
}

/* ═══════════════════════════════════════════════════════════════════════
   CALLABLE API: GET OPERATIONAL REPORT (ADMIN ONLY)
   ═══════════════════════════════════════════════════════════════════════ */

export const getOperationalReport = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<DateRangeFilter>): Promise<OperationalReportData> => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError("unauthenticated", "Authentication required to generate operational reports.");
    }

    const uid = request.auth.uid;
    const callerEmail = (request.auth.token.email || "").toLowerCase().trim();
    const db = admin.firestore();

    const isSuperadmin = callerEmail === PRIMARY_SUPERADMIN_EMAIL;

    if (!isSuperadmin) {
      // 1. Real-time revocation check against admin_revocations
      const revocationDoc = await db.collection("admin_revocations").doc(uid).get();
      if (revocationDoc.exists) {
        throw new HttpsError("permission-denied", "Administrator privileges have been revoked.");
      }

      // 2. Active status check in admins collection
      const adminDoc = await db.collection("admins").doc(uid).get();
      if (!adminDoc.exists || adminDoc.data()?.isActive === false) {
        throw new HttpsError("permission-denied", "Access restricted to active authorized EMS dispensary administrators.");
      }
    }

    return await computeOperationalReport(db, request.data);
  }
);
