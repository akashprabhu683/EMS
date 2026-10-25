import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/* ═══════════════════════════════════════════════════════════════════════
   TYPES & SCHEMAS FOR APPEND-ONLY AUDIT TRAIL
   ═══════════════════════════════════════════════════════════════════════ */

export type AuditAction =
  | "ORDER_CREATED"
  | "ORDER_STATUS_CHANGED"
  | "ORDER_COLLECTED"
  | "ORDER_CANCELLED"
  | "PAYMENT_RECORDED"
  | "PAYMENT_CORRECTED"
  | "INVENTORY_DEDUCTED"
  | "INVENTORY_RESTORED"
  | "PRODUCT_CREATED"
  | "PRODUCT_UPDATED"
  | "PRODUCT_DELETED"
  | "INVENTORY_ADJUSTED"
  | "CATEGORY_CREATED"
  | "CATEGORY_UPDATED"
  | "CATEGORY_DELETED"
  | "ADMIN_ROLE_GRANTED"
  | "ADMIN_ROLE_REVOKED"
  | "ADMIN_INVITED"
  | "ADMIN_INVITATION_RESENT";

export interface AuditActor {
  uid: string;
  email?: string;
  role: "superadmin" | "admin" | "customer" | "system";
}

export interface AuditTarget {
  collection: "orders" | "products" | "categories" | "admins" | "admin_invitations";
  id: string;
  label?: string; // Product name or non-PII order reference
}

export interface AuditFieldChange {
  field: string;
  before: any;
  after: any;
}

export interface AuditLogDocument {
  id?: string;
  action: AuditAction;
  actor: AuditActor;
  target: AuditTarget;
  summary: string;
  changes?: AuditFieldChange[];
  metadata?: Record<string, any>;
  timestamp: FirebaseFirestore.FieldValue | string;
}

/**
 * Sanitizes input values before recording in the audit trail.
 * Strips customer PII (phone numbers, full postal addresses, plain passwords/tokens).
 */
export function sanitizeAuditData(data: any): any {
  if (!data || typeof data !== "object") return data;

  const sanitized: Record<string, any> = Array.isArray(data) ? [] : {};
  const sensitiveKeys = new Set(["phone", "phoneNumber", "mobile", "address", "rawToken", "password", "token"]);

  for (const [key, value] of Object.entries(data)) {
    if (sensitiveKeys.has(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !(value instanceof Date)) {
      sanitized[key] = sanitizeAuditData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Creates a formatted AuditLogDocument payload ready for Firestore insertion.
 */
export function buildAuditPayload(params: {
  action: AuditAction;
  actor: AuditActor;
  target: AuditTarget;
  summary: string;
  changes?: AuditFieldChange[];
  metadata?: Record<string, any>;
}): AuditLogDocument {
  return {
    action: params.action,
    actor: {
      uid: params.actor.uid,
      email: params.actor.email || undefined,
      role: params.actor.role,
    },
    target: {
      collection: params.target.collection,
      id: params.target.id,
      label: params.target.label,
    },
    summary: params.summary,
    changes: params.changes ? sanitizeAuditData(params.changes) : undefined,
    metadata: params.metadata ? sanitizeAuditData(params.metadata) : undefined,
    timestamp: FieldValue.serverTimestamp(),
  };
}

/**
 * Directly appends an audit log entry in Firestore.
 */
export async function appendAuditLog(
  db: FirebaseFirestore.Firestore,
  params: {
    action: AuditAction;
    actor: AuditActor;
    target: AuditTarget;
    summary: string;
    changes?: AuditFieldChange[];
    metadata?: Record<string, any>;
  }
): Promise<string> {
  const auditRef = db.collection("audit_logs").doc();
  const payload = buildAuditPayload(params);
  await auditRef.set(payload);
  return auditRef.id;
}

/* ═══════════════════════════════════════════════════════════════════════
   PRODUCT & CATALOG CHANGE AUDIT TRIGGER
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Authoritative Firestore trigger: Watches products/{productId} for changes.
 * Automatically writes append-only audit trail for creation, updates, stock changes, and deletion.
 */
export const onProductWrittenAudit = onDocumentWritten("products/{productId}", async (event) => {
  const beforeSnap = event.data?.before;
  const afterSnap = event.data?.after;
  const db = admin.firestore();
  const productId = event.params.productId;

  const beforeData = beforeSnap?.exists ? beforeSnap.data() : null;
  const afterData = afterSnap?.exists ? afterSnap.data() : null;

  // Skip fallback trigger if authoritative backend already committed an audit log with real admin identity
  if (afterData?.auditLoggedDirectly || (!afterSnap?.exists && beforeData?.auditLoggedDirectly)) {
    return;
  }

  // 1. Product Deletion
  if (beforeSnap?.exists && !afterSnap?.exists) {
    const beforeData = beforeSnap.data() || {};
    await appendAuditLog(db, {
      action: "PRODUCT_DELETED",
      actor: { uid: "system_admin", role: "admin" },
      target: { collection: "products", id: productId, label: beforeData.name || productId },
      summary: `Product "${beforeData.name || productId}" was deleted from the catalog.`,
      metadata: { lastStock: beforeData.stock, categoryId: beforeData.categoryId },
    });
    return;
  }

  // 2. Product Creation
  if (!beforeSnap?.exists && afterSnap?.exists) {
    const afterData = afterSnap.data() || {};
    await appendAuditLog(db, {
      action: "PRODUCT_CREATED",
      actor: { uid: "system_admin", role: "admin" },
      target: { collection: "products", id: productId, label: afterData.name || productId },
      summary: `Product "${afterData.name || productId}" was created with initial stock of ${afterData.stock ?? 0} units.`,
      metadata: {
        pricePaise: afterData.price,
        stock: afterData.stock,
        categoryId: afterData.categoryId,
        isActive: afterData.isActive,
      },
    });
    return;
  }

  // 3. Product Update
  if (beforeSnap?.exists && afterSnap?.exists) {
    const beforeData = beforeSnap.data() || {};
    const afterData = afterSnap.data() || {};

    const changes: AuditFieldChange[] = [];

    // Check stock changes
    const stockBefore = Number(beforeData.stock ?? 0);
    const stockAfter = Number(afterData.stock ?? 0);
    if (stockBefore !== stockAfter) {
      changes.push({ field: "stock", before: stockBefore, after: stockAfter });
    }

    // Check price changes
    const priceBefore = Number(beforeData.price ?? 0);
    const priceAfter = Number(afterData.price ?? 0);
    if (priceBefore !== priceAfter) {
      changes.push({ field: "price", before: priceBefore, after: priceAfter });
    }

    // Check active status changes
    if (Boolean(beforeData.isActive) !== Boolean(afterData.isActive)) {
      changes.push({ field: "isActive", before: beforeData.isActive, after: afterData.isActive });
    }

    // Check low stock threshold changes
    if (beforeData.lowStockThreshold !== afterData.lowStockThreshold) {
      changes.push({
        field: "lowStockThreshold",
        before: beforeData.lowStockThreshold ?? 5,
        after: afterData.lowStockThreshold ?? 5,
      });
    }

    if (changes.length > 0) {
      const isStockOnly = changes.length === 1 && changes[0].field === "stock";
      const action: AuditAction = isStockOnly ? "INVENTORY_ADJUSTED" : "PRODUCT_UPDATED";
      const summary = isStockOnly
        ? `Stock for "${afterData.name || productId}" adjusted from ${stockBefore} to ${stockAfter} units.`
        : `Product "${afterData.name || productId}" updated: ${changes.map(c => c.field).join(", ")}.`;

      await appendAuditLog(db, {
        action,
        actor: { uid: "system_admin", role: "admin" },
        target: { collection: "products", id: productId, label: afterData.name || productId },
        summary,
        changes,
      });
    }
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   CALLABLE API: QUERY AUDIT LOGS (ADMIN ONLY)
   ═══════════════════════════════════════════════════════════════════════ */

export const PRIMARY_SUPERADMIN_EMAIL = "akashprabhu0302@gmail.com";

export interface GetAuditLogsRequest {
  action?: string;
  targetCollection?: string;
  limit?: number;
  startAfterId?: string;
}

export interface ResolvedAuditAdminStatus {
  isAdmin: boolean;
  isRevoked: boolean;
  isSuperadmin: boolean;
}

/**
 * Verifies audit trail caller authorization with real-time revocation checks
 * and mandatory email verification for superadmin / email fallback identities.
 */
export async function verifyAuditAdminCaller(
  db: FirebaseFirestore.Firestore,
  uid: string,
  email?: string,
  hasAdminClaim?: boolean,
  emailVerified?: boolean
): Promise<ResolvedAuditAdminStatus> {
  const cleanEmail = email ? email.toLowerCase().trim() : "";
  const isEmailVerified = Boolean(emailVerified);
  const isSuperadmin = isEmailVerified && cleanEmail === PRIMARY_SUPERADMIN_EMAIL.toLowerCase();

  // 1. Superadmin always has admin privileges and is immune to rogue revocation markers
  if (isSuperadmin) {
    return { isAdmin: true, isRevoked: false, isSuperadmin: true };
  }

  // 2. Real-time revocation check against /admin_revocations/{uid}
  const revocationDoc = await db.collection("admin_revocations").doc(uid).get();
  if (revocationDoc.exists) {
    return { isAdmin: false, isRevoked: true, isSuperadmin: false };
  }

  // 3. Check canonical /admins/{uid}
  const adminDoc = await db.collection("admins").doc(uid).get();
  if (adminDoc.exists) {
    if (adminDoc.data()?.isActive === false) {
      return { isAdmin: false, isRevoked: false, isSuperadmin: false };
    }
    return { isAdmin: true, isRevoked: false, isSuperadmin: false };
  }

  // 4. Fallback: Check /admins by verified email
  if (cleanEmail && isEmailVerified) {
    const querySnap = await db.collection("admins").where("email", "==", cleanEmail).limit(1).get();
    if (!querySnap.empty && querySnap.docs[0].data()?.isActive !== false) {
      return { isAdmin: true, isRevoked: false, isSuperadmin: false };
    }
  }

  // 5. Token claim fallback (only if not revoked)
  if (Boolean(hasAdminClaim)) {
    return { isAdmin: true, isRevoked: false, isSuperadmin: false };
  }

  return { isAdmin: false, isRevoked: false, isSuperadmin: false };
}

export const getAuditLogs = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<GetAuditLogsRequest>) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError("unauthenticated", "Authentication required to view audit logs.");
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email;
    const emailVerified = Boolean(request.auth.token.email_verified);
    const db = admin.firestore();

    const { isAdmin, isRevoked, isSuperadmin } = await verifyAuditAdminCaller(
      db,
      uid,
      email,
      Boolean(request.auth.token.admin),
      emailVerified
    );

    if (isRevoked) {
      throw new HttpsError("permission-denied", "Administrator privilege has been revoked for this account.");
    }

    if (!isAdmin) {
      throw new HttpsError("permission-denied", "Only authorized administrators can access audit trails.");
    }

    if (isSuperadmin) {
      const adminRef = db.collection("admins").doc(uid);
      const snap = await adminRef.get();
      if (!snap.exists) {
        await adminRef.set({
          uid,
          email: (email || "").toLowerCase().trim(),
          name: request.auth.token.name || "Dispensary Superadmin",
          role: "superadmin",
          isActive: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    const queryLimit = Math.min(request.data.limit || 50, 100);
    let q: FirebaseFirestore.Query = db.collection("audit_logs").orderBy("timestamp", "desc");

    if (request.data.action) {
      q = q.where("action", "==", request.data.action);
    }
    if (request.data.targetCollection) {
      q = q.where("target.collection", "==", request.data.targetCollection);
    }

    if (request.data.startAfterId) {
      const lastDoc = await db.collection("audit_logs").doc(request.data.startAfterId).get();
      if (lastDoc.exists) {
        q = q.startAfter(lastDoc);
      }
    }

    q = q.limit(queryLimit);

    const snapshot = await q.get();
    const logs = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : data.timestamp,
      };
    });

    return { logs, count: logs.length };
  }
);
