import { httpsCallable } from 'firebase/functions';
import { collection, getDocs } from 'firebase/firestore';
import { functions, db } from '../firebase';
import type { OperationalReportData } from '../types';

export const STORE_TIMEZONE = 'Asia/Kolkata';

export function formatIstDateKey(dateInput: Date | string): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Loads the comprehensive operational and financial report from the server.
 */
export async function fetchOperationalReport(filter?: {
  startDate?: string;
  endDate?: string;
}): Promise<OperationalReportData> {
  // 1. Try server-side Cloud Function callable
  try {
    const reportFn = httpsCallable<any, OperationalReportData>(functions, 'getOperationalReport');
    const result = await reportFn(filter || {});
    if (result.data) {
      return result.data;
    }
  } catch (fnErr) {
    console.warn('[adminReportService] Cloud Function getOperationalReport failed, falling back to client-side computation:', fnErr);
  }

  // 2. Client-side Firestore computation fallback
  const [ordersSnap, productsSnap] = await Promise.all([
    getDocs(collection(db, 'orders')),
    getDocs(collection(db, 'products')),
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

  for (const doc of ordersSnap.docs) {
    const o = doc.data();
    const orderId = doc.id;
    const status = String(o.orderStatus || 'placed');
    const paymentStatus = String(o.paymentStatus || 'unpaid');
    const total = Number(o.total || o.totalPaise || 0);

    const createdAtIso = o.createdAt?.toDate ? o.createdAt.toDate().toISOString() : o.createdAt;
    if (filter?.startDate || filter?.endDate) {
      if (createdAtIso) {
        const orderDateKey = formatIstDateKey(createdAtIso);
        if (filter.startDate && orderDateKey < filter.startDate) continue;
        if (filter.endDate && orderDateKey > filter.endDate) continue;
      }
    }

    report.orders.totalOrders++;

    switch (status) {
      case 'placed':
        report.orders.placed.count++;
        report.orders.placed.totalPaise += total;
        report.orders.activeOrders++;
        report.financials.grossPipelinePaise += total;
        break;
      case 'accepted':
        report.orders.awaitingPreparation.count++;
        report.orders.awaitingPreparation.totalPaise += total;
        report.orders.activeOrders++;
        report.financials.grossPipelinePaise += total;
        break;
      case 'preparing':
        report.orders.inPreparation.count++;
        report.orders.inPreparation.totalPaise += total;
        report.orders.activeOrders++;
        report.financials.grossPipelinePaise += total;
        break;
      case 'ready_for_pickup':
        report.orders.readyForPickup.count++;
        report.orders.readyForPickup.totalPaise += total;
        report.orders.activeOrders++;
        report.financials.grossPipelinePaise += total;
        break;
      case 'collected':
        report.orders.collected.count++;
        report.orders.collected.totalPaise += total;
        report.orders.activeOrders++;
        report.financials.grossPipelinePaise += total;
        break;
      case 'cancelled':
        report.orders.cancelled.count++;
        report.orders.cancelled.totalPaise += total;
        report.financials.cancelledPaise += total;
        break;
      default:
        report.orders.activeOrders++;
        report.financials.grossPipelinePaise += total;
    }

    if (paymentStatus === 'paid') {
      report.financials.confirmedCashPaise += total;
      report.financials.confirmedPaymentsCount++;

      const paidDateSource = o.paidAt?.toDate ? o.paidAt.toDate() : (o.paidAt ? new Date(o.paidAt) : (createdAtIso ? new Date(createdAtIso) : new Date()));
      const dateKey = formatIstDateKey(paidDateSource);

      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { collectedCount: 0, cashPaise: 0, actors: new Set() });
      }
      const dayEntry = dailyMap.get(dateKey)!;
      dayEntry.cashPaise += total;
      if (status === 'collected') {
        dayEntry.collectedCount++;
      }
      if (o.paidConfirmedBy) {
        dayEntry.actors.add(String(o.paidConfirmedBy));
      }
    } else if (status !== 'cancelled') {
      report.financials.outstandingUnpaidPaise += total;
    }

    // Reconciliation
    if (status === 'collected' && paymentStatus !== 'paid') {
      report.reconciliation.discrepancies.push({
        type: 'UNPAID_COLLECTION',
        severity: 'warning',
        orderId,
        description: `Order ${orderId} was collected, but payment is still pending.`,
      });
    }
    if (status === 'cancelled' && paymentStatus === 'paid') {
      report.reconciliation.discrepancies.push({
        type: 'PAID_CANCELLED',
        severity: 'high',
        orderId,
        description: `Order ${orderId} is cancelled with a confirmed payment of ₹${(total / 100).toFixed(2)}. Verify refund status.`,
      });
    }
    if (status === 'cancelled' && o.inventoryDeducted && !o.inventoryRestored) {
      report.reconciliation.discrepancies.push({
        type: 'UNRESTORED_INVENTORY',
        severity: 'warning',
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

  report.dailyCollections = Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      ordersCollected: data.collectedCount,
      cashCollectedPaise: data.cashPaise,
      cashCollectedRupees: data.cashPaise / 100,
      staffActors: Array.from(data.actors),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

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
  report.inventory.lowStockAlerts.sort((a, b) => a.currentStock - b.currentStock);

  return report;
}

/**
 * Exports the daily in-person collections summary as a CSV file.
 */
export function exportDailyCollectionsCsv(daily: OperationalReportData['dailyCollections']): void {
  const headers = ['Date (IST)', 'Orders Collected', 'Cash / Counter Received (INR)', 'Confirming Staff'];
  const rows = daily.map((d) => [
    `"${d.date}"`,
    d.ordersCollected,
    d.cashCollectedRupees.toFixed(2),
    `"${d.staffActors.join('; ')}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `EMS_Daily_Collections_IST_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
