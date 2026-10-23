import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

/**
 * Automatically decrements inventory in products/{productId} when a new order is created.
 * Uses atomic Firestore transactions to prevent overselling.
 */
export const onOrderCreatedInventory = onDocumentCreated("orders/{orderId}", async (event) => {
  const snap = event.data;
  if (!snap) {
    logger.warn("onOrderCreatedInventory: No data in document snapshot");
    return;
  }

  const orderId = event.params.orderId;
  const order = snap.data();

  // Guard: If inventory was already deducted or order has no items
  if (order.inventoryDeducted) {
    logger.info(`onOrderCreatedInventory: Order ${orderId} inventory already marked as deducted.`);
    return;
  }

  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length === 0) {
    logger.warn(`onOrderCreatedInventory: Order ${orderId} has no items to deduct.`);
    return;
  }

  logger.info(`onOrderCreatedInventory: Processing stock deduction for order ${orderId} with ${items.length} items.`);

  try {
    await db.runTransaction(async (transaction) => {
      // 1. Read all product docs to verify stock
      const productReads = items.map((item: any) => {
        const prodRef = db.collection("products").doc(item.productId);
        return transaction.get(prodRef);
      });

      const productSnapshots = await Promise.all(productReads);

      // Check stock sufficiency
      const outOfStockItems: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const prodSnap = productSnapshots[i];

        if (!prodSnap.exists) {
          outOfStockItems.push(`${item.name || item.productId} (Catalog item not found)`);
          continue;
        }

        const currentStock = Number(prodSnap.data()?.stock ?? 0);
        const reqQty = Number(item.quantity ?? 1);

        if (currentStock < reqQty) {
          outOfStockItems.push(`${item.name || item.productId} (Available: ${currentStock}, Requested: ${reqQty})`);
        }
      }

      const orderRef = db.collection("orders").doc(orderId);

      // 2. If any item is out of stock, cancel order and record reason
      if (outOfStockItems.length > 0) {
        logger.warn(`Order ${orderId} cancelled due to stock depletion: ${outOfStockItems.join(", ")}`);
        transaction.update(orderRef, {
          orderStatus: "cancelled",
          cancelReason: `Insufficient stock for: ${outOfStockItems.join("; ")}`,
          inventoryDeducted: false,
          updatedAt: FieldValue.serverTimestamp(),
          statusHistory: FieldValue.arrayUnion({
            status: "cancelled",
            timestamp: new Date().toISOString(),
            note: `System auto-cancelled: Insufficient stock for ${outOfStockItems.join("; ")}`,
          }),
        });
        return;
      }

      // 3. Atomically decrement stock for each item
      const stockChanges: { field: string; before: number; after: number; name: string }[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const prodSnap = productSnapshots[i];
        const reqQty = Number(item.quantity ?? 1);
        const currentStock = Number(prodSnap.data()?.stock ?? 0);
        const threshold = Number(prodSnap.data()?.lowStockThreshold ?? 5);
        const newStock = Math.max(0, currentStock - reqQty);

        transaction.update(prodSnap.ref, {
          stock: newStock,
          isLowStock: newStock > 0 && newStock <= threshold,
          isOutOfStock: newStock === 0,
          updatedAt: FieldValue.serverTimestamp(),
        });

        stockChanges.push({
          field: `stock_${item.productId}`,
          before: currentStock,
          after: newStock,
          name: item.name || item.productId,
        });
      }

      // 4. Mark order inventory as successfully deducted
      transaction.update(orderRef, {
        inventoryDeducted: true,
        inventoryDeductedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // 5. Append-only server audit log
      const auditRef = db.collection("audit_logs").doc();
      transaction.set(auditRef, {
        action: "INVENTORY_DEDUCTED",
        actor: { uid: "system", role: "system" },
        target: { collection: "orders", id: orderId, label: `Order #${orderId.slice(-6)}` },
        summary: `Authoritative stock deducted for ${items.length} items on order placement.`,
        changes: stockChanges.map(s => ({ field: s.name, before: s.before, after: s.after })),
        timestamp: FieldValue.serverTimestamp(),
      });
    });

    logger.info(`Successfully completed stock deduction for order ${orderId}.`);
  } catch (err: any) {
    logger.error(`Failed to process stock deduction for order ${orderId}:`, err);
  }
});

/**
 * Restores product stock when an order is cancelled, if inventory was previously deducted.
 */
export const onOrderCancelledInventory = onDocumentUpdated("orders/{orderId}", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();

  if (!beforeData || !afterData) return;

  const orderId = event.params.orderId;

  // Check if order just transitioned to 'cancelled'
  const becameCancelled = beforeData.orderStatus !== "cancelled" && afterData.orderStatus === "cancelled";
  const wasDeducted = afterData.inventoryDeducted === true;
  const alreadyRestored = afterData.inventoryRestored === true;

  if (becameCancelled && wasDeducted && !alreadyRestored) {
    logger.info(`onOrderCancelledInventory: Restoring stock for cancelled order ${orderId}.`);

    const items = Array.isArray(afterData.items) ? afterData.items : [];
    if (items.length === 0) return;

    try {
      await db.runTransaction(async (transaction) => {
        const restoredItems: { name: string; before: number; after: number }[] = [];
        for (const item of items) {
          if (!item.productId) continue;
          const prodRef = db.collection("products").doc(item.productId);
          const prodSnap = await transaction.get(prodRef);

          if (prodSnap.exists) {
            const currentStock = Number(prodSnap.data()?.stock ?? 0);
            const restoreQty = Number(item.quantity ?? 1);
            const threshold = Number(prodSnap.data()?.lowStockThreshold ?? 5);
            const newStock = currentStock + restoreQty;

            transaction.update(prodRef, {
              stock: newStock,
              isLowStock: newStock > 0 && newStock <= threshold,
              isOutOfStock: false,
              updatedAt: FieldValue.serverTimestamp(),
            });

            restoredItems.push({
              name: item.name || item.productId,
              before: currentStock,
              after: newStock,
            });
          }
        }

        const orderRef = db.collection("orders").doc(orderId);
        transaction.update(orderRef, {
          inventoryRestored: true,
          inventoryRestoredAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          statusHistory: FieldValue.arrayUnion({
            status: "stock_restored",
            timestamp: new Date().toISOString(),
            note: "Product inventory automatically restored to catalog upon cancellation.",
          }),
        });

        // Append-only audit log
        const auditRef = db.collection("audit_logs").doc();
        transaction.set(auditRef, {
          action: "INVENTORY_RESTORED",
          actor: { uid: "system", role: "system" },
          target: { collection: "orders", id: orderId, label: `Order #${orderId.slice(-6)}` },
          summary: `Inventory restored to catalog for cancelled order #${orderId.slice(-6)}.`,
          changes: restoredItems.map(r => ({ field: r.name, before: r.before, after: r.after })),
          timestamp: FieldValue.serverTimestamp(),
        });
      });

      logger.info(`Successfully restored inventory for cancelled order ${orderId}.`);
    } catch (err: any) {
      logger.error(`Failed to restore inventory for cancelled order ${orderId}:`, err);
    }
  }
});
