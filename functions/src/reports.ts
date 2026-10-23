import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

export const STORE_TIMEZONE = "Asia/Kolkata";

export interface DateRangeFilter {
  startDate?: string; // YYYY-MM-DD or ISO
  endDate?: string;   // YYYY-MM-DD or ISO
}

export interface OperationalReportData {
  generatedAt: string;
  timezone: string;
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
 * Computes the operational & financial reporting metrics using authoritative Firestore records.
 */
export async function computeOperationalReport(
  db: FirebaseFirestore.Firestore,
  filter?: DateRangeFilter
): Promise<OperationalReportData> {
  const [ordersSnap, productsSnap] = await Promise.all([
    db.collection("orders").get(),
    db.collection("products").get(),
  ]);

  const report: OperationalReportData = {
    generatedAt: new Date().toISOString(),
    timezone: STORE_TIMEZONE,
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

  // 1. Process Orders
  for (const doc of ordersSnap.docs) {
    const o = doc.data();
    const orderId = doc.id;
    const status = String(o.orderStatus || "placed");
    const paymentStatus = String(o.paymentStatus || "unpaid");
    const total = Number(o.total || o.totalPaise || 0);

    // Apply optional date filter on createdAt
    const createdAtIso = o.createdAt?.toDate ? o.createdAt.toDate().toISOString() : o.createdAt;
    if (filter?.startDate || filter?.endDate) {
      if (createdAtIso) {
        const orderDateKey = formatIstDateKey(createdAtIso);
        if (filter.startDate && orderDateKey < filter.startDate) continue;
        if (filter.endDate && orderDateKey > filter.endDate) continue;
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
      const paidDateSource = o.paidAt?.toDate ? o.paidAt.toDate() : (o.paidAt ? new Date(o.paidAt) : (createdAtIso ? new Date(createdAtIso) : new Date()));
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

    // 2. Reconciliation & Integrity Checks
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

  // 3. Process Product Catalog & Configurable Stock Alerts
  for (const doc of productsSnap.docs) {
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
  // Sort low stock alerts so out-of-stock items appear first
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
    const db = admin.firestore();

    // Verify admin privileges
    let isAdmin = Boolean(request.auth.token.admin);
    if (!isAdmin) {
      const adminSnap = await db.collection("admins").doc(uid).get();
      if (adminSnap.exists) isAdmin = true;
    }

    if (!isAdmin) {
      throw new HttpsError("permission-denied", "Access restricted to authorized EMS dispensary administrators.");
    }

    return await computeOperationalReport(db, request.data);
  }
);
