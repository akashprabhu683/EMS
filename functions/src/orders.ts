import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as crypto from "crypto";

/* ═══════════════════════════════════════════════════════════════════════
   CONSTANTS & LIMITS
   ═══════════════════════════════════════════════════════════════════════ */

export const MAX_DISTINCT_ITEMS_PER_ORDER = 50;
export const MAX_QUANTITY_PER_ITEM = 99;
export const MAX_CATALOG_PRICE_PAISE = 100_000_000; // ₹10,00,000 maximum single item price in paise
export const FREE_SHIPPING_THRESHOLD_PAISE = 0; // Click & Collect is free pickup at the dispensary
export const STANDARD_SHIPPING_FEE_PAISE = 0; // No delivery fee for store pickup
export const COD_FEE_PAISE = 0; // No COD handling fee

/**
 * Recursively cleans an object by stripping any keys with value `undefined`.
 * Preserves `null`, `false`, `0`, `""`, Date, and FieldValue instances.
 * Prevents Firestore Admin SDK crash: Cannot use "undefined" as a Firestore value.
 */
export function cleanFirestorePayload<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== 'object') {
    return val;
  }
  if (
    val instanceof Date ||
    val instanceof FieldValue ||
    (val as any).constructor?.name === 'FieldValue' ||
    (val as any).constructor?.name?.includes('Transform')
  ) {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(cleanFirestorePayload) as unknown as T;
  }
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(val as Record<string, any>)) {
    if (v !== undefined) {
      result[k] = cleanFirestorePayload(v);
    }
  }
  return result as T;
}

/* ═══════════════════════════════════════════════════════════════════════
   TYPES & CONTRACTS
   ═══════════════════════════════════════════════════════════════════════ */

export interface PickupContactInput {
  name?: string;
  fullName?: string;
  phone: string;
  notes?: string;
}

export interface NormalizedPickupContact {
  fullName: string;
  phone: string;
  notes?: string;
}

export interface CreateOrderRequestData {
  pickupContact: PickupContactInput;
  idempotencyKey: string;
  paymentMethod?: string;
}

export interface OrderItemSnapshot {
  productId: string;
  name: string;
  unitPrice: number; // in paise
  quantity: number;
  lineTotal: number; // in paise
  selectedColor?: string | null;
  selectedSize?: string | null;
  imageUrl?: string | null;
}

export interface CreateOrderResponse {
  orderId: string;
  subtotal: number; // in paise
  shippingFee: number; // in paise
  codFee: number; // in paise
  total: number; // in paise
  orderStatus: string; // placed, accepted, preparing, ready_for_pickup, collected, cancelled
  paymentStatus: string; // unpaid, paid
  paymentMethod: string; // click_and_collect
  itemCount: number;
  pickupLocation: string;
  pickupCode: string;
  createdAt: string; // ISO string
}

/* ═══════════════════════════════════════════════════════════════════════
   VALIDATION HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Validates whether a given string is a valid Firestore document ID.
 * Document IDs cannot be empty, '.', '..', contain forward slashes, or exceed 128 characters.
 */
export function isValidProductId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || trimmed.length > 128) {
    return false;
  }
  // Allow alphanumeric, hyphen, underscore, and dot (non-initial)
  return /^[a-zA-Z0-9_\-.]{1,128}$/.test(trimmed);
}

/**
 * Validates that an image URL is a valid, well-formed HTTPS URL.
 */
export function isValidHttpsUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith("https://") || trimmed.length > 2048) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Validates and normalizes customer pickup contact inputs.
 */
export function validateAndNormalizePickupContact(raw: unknown): NormalizedPickupContact {
  if (typeof raw !== "object" || raw === null) {
    throw new HttpsError("invalid-argument", "Pickup contact information is required and must be an object.");
  }

  const contact = raw as Record<string, unknown>;

  const fullName = typeof contact.fullName === "string"
    ? contact.fullName.trim()
    : (typeof contact.name === "string" ? contact.name.trim() : "");

  if (!fullName || fullName.length < 2 || fullName.length > 100) {
    throw new HttpsError("invalid-argument", "A valid customer name (2-100 characters) is required for shop pickup.");
  }

  const phone = typeof contact.phone === "string" ? contact.phone.trim() : "";
  const phoneRegex = /^[0-9+\s\-()]{7,20}$/;
  if (!phone || !phoneRegex.test(phone)) {
    throw new HttpsError("invalid-argument", "A valid contact phone number (7-20 digits) is required for pickup confirmation.");
  }

  const notes = typeof contact.notes === "string" && contact.notes.trim().length > 0
    ? contact.notes.trim().slice(0, 300)
    : undefined;

  return {
    fullName,
    phone,
    notes,
  };
}

/**
 * Validates the idempotency key format to prevent malformed or injection keys.
 */
export function validateIdempotencyKey(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", "idempotencyKey must be a string.");
  }

  const key = raw.trim();
  if (key.length < 8 || key.length > 128) {
    throw new HttpsError("invalid-argument", "idempotencyKey must be between 8 and 128 characters.");
  }

  const validKeyRegex = /^[A-Za-z0-9_\-\.:]+$/;
  if (!validKeyRegex.test(key)) {
    throw new HttpsError("invalid-argument", "idempotencyKey contains invalid characters.");
  }

  return key;
}

/**
 * Validates the payment/fulfillment method. For Click-and-Collect, payment is made in person at the shop upon pickup.
 */
export function validatePaymentMethod(raw: unknown): "click_and_collect" {
  if (!raw || typeof raw !== "string") {
    return "click_and_collect";
  }

  const method = raw.trim().toLowerCase();
  if (method === "click_and_collect" || method === "pay_at_store" || method === "cod") {
    return "click_and_collect";
  }

  if (["razorpay", "card", "upi", "netbanking", "stripe"].includes(method)) {
    throw new HttpsError(
      "failed-precondition",
      `Online payment method "${method}" is not enabled. All orders use Click-and-Collect with in-person payment at our physical dispensary upon pickup.`
    );
  }

  return "click_and_collect";
}

/**
 * Computes a deterministic SHA-256 fingerprint of the normalized order request.
 */
export function computeRequestFingerprint(
  uid: string,
  items: Array<{ productId: string; quantity: number; selectedColor?: string; selectedSize?: string }>,
  contact: NormalizedPickupContact,
  paymentMethod: string
): string {
  const sortedItems = [...items].sort((a, b) => a.productId.localeCompare(b.productId));
  const payload = JSON.stringify({
    uid,
    items: sortedItems,
    contact: {
      fullName: contact.fullName,
      phone: contact.phone,
      notes: contact.notes || "",
    },
    paymentMethod,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/* ═══════════════════════════════════════════════════════════════════════
   CORE TRANSACTION EXECUTION
   Separated for modularity, clean unit testing, and atomic safety.
   ═══════════════════════════════════════════════════════════════════════ */

export async function executeCreateOrder(
  db: admin.firestore.Firestore,
  uid: string,
  data: CreateOrderRequestData
): Promise<CreateOrderResponse> {
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("unauthenticated", "Authentication required to place an order.");
  }

  const idempotencyKey = validateIdempotencyKey(data?.idempotencyKey);
  const normalizedContact = validateAndNormalizePickupContact(data?.pickupContact);
  const paymentMethod = validatePaymentMethod(data?.paymentMethod);

  const idempotencyRef = db.collection("idempotency_records").doc(`${uid}_${idempotencyKey}`);
  const cartRef = db.collection("carts").doc(uid);

  return await db.runTransaction(async (transaction) => {
    /* ─────────────────────────────────────────────────────────────
       STEP 1: ALL READS (Must precede any writes in Firestore)
       ───────────────────────────────────────────────────────────── */

    // 1.1 Read idempotency record
    const idempotencySnap = await transaction.get(idempotencyRef);
    let existing = idempotencySnap.exists ? idempotencySnap.data() : null;

    if (!existing) {
      // Backward compatibility check for pre-Phase-6B legacy records stored in idempotency_keys
      const legacyIdempRef = db.collection("idempotency_keys").doc(idempotencyKey);
      const legacySnap = await transaction.get(legacyIdempRef);
      if (legacySnap.exists) {
        const legData = legacySnap.data();
        if (legData && (legData.userId === uid || legData.uid === uid)) {
          existing = legData;
        }
      }
    }

    // 1.2 Read authenticated customer's cart
    const cartSnap = await transaction.get(cartRef);

    // If an idempotency record already exists, validate it and handle retry
    if (existing) {
      // Detect malformed or corrupted idempotency record
      if (
        typeof existing !== "object" ||
        typeof existing.orderId !== "string" ||
        !existing.orderId ||
        !existing.response ||
        typeof existing.response !== "object" ||
        typeof existing.response.orderId !== "string"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Existing idempotency record for this key is corrupted or malformed. Please supply a fresh idempotency key."
        );
      }

      // If cart has items, verify fingerprint hasn't changed (protect against key reuse with new cart)
      const rawCartItems = cartSnap.exists ? cartSnap.data()?.items : [];
      if (Array.isArray(rawCartItems) && rawCartItems.length > 0) {
        const pMap = new Map<string, { quantity: number; selectedColor?: string; selectedSize?: string }>();
        for (const item of rawCartItems) {
          if (item && typeof item === "object" && item.productId) {
            pMap.set(String(item.productId), {
              quantity: Number(item.quantity) || 1,
              selectedColor: item.selectedColor,
              selectedSize: item.selectedSize,
            });
          }
        }
        const currentFp = computeRequestFingerprint(
          uid,
          Array.from(pMap.entries()).map(([pid, it]) => ({
            productId: pid,
            quantity: it.quantity,
            selectedColor: it.selectedColor,
            selectedSize: it.selectedSize,
          })),
          normalizedContact,
          paymentMethod
        );

        if (existing.requestFingerprint && existing.requestFingerprint !== currentFp) {
          throw new HttpsError(
            "already-exists",
            "This idempotency key was previously used with different order details. Please supply a fresh idempotency key."
          );
        }
      }

      // Exact matching request retry (cart cleared upon first successful submission)
      return existing.response as CreateOrderResponse;
    }

    // New order: Cart must exist and have non-empty items
    if (!cartSnap.exists) {
      throw new HttpsError("failed-precondition", "Your shopping cart is empty.");
    }

    const cartData = cartSnap.data();
    const rawItems = cartData?.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new HttpsError("failed-precondition", "Your shopping cart is empty.");
    }

    // Validate cart items structure and deduplicate / check bounds
    const productQuantityMap = new Map<
      string,
      { quantity: number; selectedColor?: string; selectedSize?: string }
    >();

    for (const item of rawItems) {
      if (typeof item !== "object" || item === null) {
        throw new HttpsError("invalid-argument", "Malformed item found in cart.");
      }

      const productId = typeof item.productId === "string" ? item.productId.trim() : "";
      const quantity = typeof item.quantity === "number" ? item.quantity : 0;

      if (!productId) {
        throw new HttpsError("invalid-argument", "Cart item is missing a valid product ID.");
      }

      // Validate product ID format before using as document path
      if (!isValidProductId(productId)) {
        throw new HttpsError(
          "invalid-argument",
          `Invalid product ID format for "${productId}". Product IDs must be 1-128 characters without slashes.`
        );
      }

      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        throw new HttpsError(
          "invalid-argument",
          `Invalid quantity (${quantity}) for product "${productId}". Quantity must be a positive safe integer.`
        );
      }

      if (quantity > MAX_QUANTITY_PER_ITEM) {
        throw new HttpsError(
          "invalid-argument",
          `Quantity for product "${productId}" exceeds maximum permitted limit (${MAX_QUANTITY_PER_ITEM}).`
        );
      }

      if (productQuantityMap.has(productId)) {
        throw new HttpsError("invalid-argument", `Duplicate product ID "${productId}" in cart.`);
      }

      productQuantityMap.set(productId, {
        quantity,
        selectedColor: typeof item.selectedColor === "string" ? item.selectedColor.trim().slice(0, 50) : undefined,
        selectedSize: typeof item.selectedSize === "string" ? item.selectedSize.trim().slice(0, 50) : undefined,
      });
    }

    // Enforce reasonable limit on distinct products per order before reading product documents
    if (productQuantityMap.size > MAX_DISTINCT_ITEMS_PER_ORDER) {
      throw new HttpsError(
        "invalid-argument",
        `Cart contains too many distinct items (${productQuantityMap.size}). Maximum allowed is ${MAX_DISTINCT_ITEMS_PER_ORDER}.`
      );
    }

    // Compute request fingerprint for idempotency validation
    const currentFingerprint = computeRequestFingerprint(
      uid,
      Array.from(productQuantityMap.entries()).map(([pid, it]) => ({
        productId: pid,
        quantity: it.quantity,
        selectedColor: it.selectedColor,
        selectedSize: it.selectedSize,
      })),
      normalizedContact,
      paymentMethod
    );

    // 1.3 Validate existing idempotency record (if present)
    if (idempotencySnap.exists) {
      const existing = idempotencySnap.data();

      // Detect malformed or corrupted idempotency record
      if (
        !existing ||
        typeof existing !== "object" ||
        typeof existing.orderId !== "string" ||
        !existing.orderId ||
        !existing.response ||
        typeof existing.response !== "object" ||
        typeof existing.response.orderId !== "string" ||
        typeof existing.requestFingerprint !== "string"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Existing idempotency record for this key is corrupted or malformed. Please supply a fresh idempotency key."
        );
      }

      // Detect reuse of existing idempotency key with different request details
      if (existing.requestFingerprint !== currentFingerprint) {
        throw new HttpsError(
          "already-exists",
          "This idempotency key was previously used with different order details. Please supply a fresh idempotency key."
        );
      }

      // Exact matching request retry -> return cached response safely
      return existing.response as CreateOrderResponse;
    }

    // 1.4 Read all authoritative product documents
    const productIds = Array.from(productQuantityMap.keys());
    const productRefs = productIds.map((id) => db.collection("products").doc(id));
    const productSnaps = await Promise.all(productRefs.map((ref) => transaction.get(ref)));

    /* ─────────────────────────────────────────────────────────────
       STEP 2: IN-MEMORY VALIDATION & SERVER-SIDE PRICE CALCULATION
       ───────────────────────────────────────────────────────────── */
    let subtotal = 0;
    const orderItems: OrderItemSnapshot[] = [];
    const stockUpdates: Array<{ ref: admin.firestore.DocumentReference; newStock: number }> = [];

    for (let i = 0; i < productIds.length; i++) {
      const snap = productSnaps[i];
      const pid = productIds[i];
      const cartItem = productQuantityMap.get(pid)!;

      if (!snap.exists) {
        throw new HttpsError("not-found", `Product with ID "${pid}" does not exist in catalog.`);
      }

      const pData = snap.data();
      if (!pData) {
        throw new HttpsError("not-found", `Product with ID "${pid}" contains no data.`);
      }

      if (pData.isActive !== true) {
        throw new HttpsError(
          "failed-precondition",
          `Product "${pData.name || pid}" is no longer active or available.`
        );
      }

      const price = Number(pData.price);
      if (!Number.isSafeInteger(price) || price <= 0 || price > MAX_CATALOG_PRICE_PAISE) {
        throw new HttpsError(
          "internal",
          `Product "${pData.name || pid}" has an invalid catalog price configuration.`
        );
      }

      const currentStock = Number(pData.stock);
      if (!Number.isSafeInteger(currentStock) || currentStock < 0) {
        throw new HttpsError(
          "internal",
          `Product "${pData.name || pid}" has an invalid stock configuration.`
        );
      }

      if (currentStock < cartItem.quantity) {
        throw new HttpsError(
          "failed-precondition",
          `Insufficient stock for "${pData.name || pid}". Available: ${currentStock}, requested: ${cartItem.quantity}.`
        );
      }

      // Safe integer line total and overflow protection
      const lineTotal = price * cartItem.quantity;
      if (!Number.isSafeInteger(lineTotal) || lineTotal <= 0) {
        throw new HttpsError("internal", "Item total calculation resulted in an arithmetic overflow.");
      }

      if (!Number.isSafeInteger(subtotal + lineTotal) || subtotal + lineTotal > Number.MAX_SAFE_INTEGER) {
        throw new HttpsError("internal", "Order subtotal calculation resulted in an arithmetic overflow.");
      }
      subtotal += lineTotal;

      // Consistent HTTPS image URL validation
      let imageUrl: string | undefined;
      if (isValidHttpsUrl(pData.imageUrl)) {
        imageUrl = pData.imageUrl.trim();
      } else if (Array.isArray(pData.images) && isValidHttpsUrl(pData.images[0])) {
        imageUrl = pData.images[0].trim();
      }

      orderItems.push({
        productId: pid,
        name: String(pData.name || "Product"),
        unitPrice: price,
        quantity: cartItem.quantity,
        lineTotal,
        selectedColor: cartItem.selectedColor || null,
        selectedSize: cartItem.selectedSize || null,
        imageUrl: imageUrl || null,
      });

      stockUpdates.push({
        ref: snap.ref,
        newStock: currentStock - cartItem.quantity,
      });
    }

    if (!Number.isSafeInteger(subtotal) || subtotal <= 0) {
      throw new HttpsError("failed-precondition", "Order subtotal must be greater than zero.");
    }

    // Click-and-Collect: No shipping fee, no COD fee. Customer collects from dispensary.
    const shippingFee = 0;
    const codFee = 0;
    const total = subtotal;

    const orderRef = db.collection("orders").doc();
    const orderId = orderRef.id;
    const now = FieldValue.serverTimestamp();
    const DEFAULT_PICKUP_LOCATION = "EMS Herbal & Ayurvedic Dispensary, Main Road Health Complex (Opp. City Wellness Center), Postal Code: 560001";
    const pickupCode = crypto.randomInt(100000, 1000000).toString();

    const orderRecord = {
      id: orderId,
      userId: uid,
      items: orderItems,
      subtotal,
      shippingFee,
      codFee,
      total,
      fulfillmentMethod: "click_and_collect",
      pickupContact: normalizedContact,
      pickupLocation: DEFAULT_PICKUP_LOCATION,
      pickupCode,
      pickupAttempts: 0,
      maxPickupAttempts: 5,
      inventoryDeducted: true,
      orderStatus: "placed",
      paymentStatus: "unpaid",
      paymentMethod: "click_and_collect",
      idempotencyKey,
      statusHistory: [
        {
          status: "placed",
          timestamp: new Date().toISOString(),
          actor: "customer",
          actorId: uid,
          note: "Order placed for Click-and-Collect. Awaiting dispensary confirmation.",
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    const responsePayload: CreateOrderResponse = {
      orderId,
      subtotal,
      shippingFee,
      codFee,
      total,
      orderStatus: "placed",
      paymentStatus: "unpaid",
      paymentMethod: "click_and_collect",
      itemCount: orderItems.reduce((sum, it) => sum + it.quantity, 0),
      pickupLocation: DEFAULT_PICKUP_LOCATION,
      pickupCode,
      createdAt: new Date().toISOString(),
    };

    /* ─────────────────────────────────────────────────────────────
       STEP 3: ALL WRITES (Atomically committed)
       ───────────────────────────────────────────────────────────── */

    // 3.1 Create immutable order snapshot
    transaction.set(orderRef, cleanFirestorePayload(orderRecord));

    // 3.2 Atomically decrement product stock
    for (const update of stockUpdates) {
      transaction.update(update.ref, {
        stock: update.newStock,
        updatedAt: now,
      });
    }

    // 3.3 Save idempotency record with request fingerprint, contact, and response cache
    transaction.set(idempotencyRef, {
      uid,
      idempotencyKey,
      orderId,
      pickupContact: normalizedContact,
      paymentMethod: "click_and_collect",
      requestFingerprint: currentFingerprint,
      response: responsePayload,
      createdAt: now,
    });

    // 3.4 Clear cart (only committed if cart was unchanged since read)
    transaction.update(cartRef, {
      items: [],
      updatedAt: now,
    });

    return responsePayload;
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   FIREBASE CALLABLE CLOUD FUNCTION
   ═══════════════════════════════════════════════════════════════════════ */

export const createOrder = onCall(
  {
    cors: true,
    invoker: "public",
  },
  async (request: CallableRequest<CreateOrderRequestData>): Promise<CreateOrderResponse> => {
    // 1. Enforce authenticated caller
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError("unauthenticated", "Authentication required to place an order.");
    }

    const uid = request.auth.uid;
    const db = admin.firestore();

    try {
      return await executeCreateOrder(db, uid, request.data);
    } catch (err: unknown) {
      // Re-throw known intentional HttpsErrors directly to client
      if (err instanceof HttpsError) {
        throw err;
      }

      // Log detailed error server-side without leaking sensitive customer PII
      logger.error("Internal order placement failure", {
        uid,
        error: err instanceof Error ? err.stack || err.message : String(err),
      });

      // Return a clean, generic error to client
      throw new HttpsError("internal", "An internal error occurred while processing your order. Please try again later.");
    }
  }
);

/* ═══════════════════════════════════════════════════════════════════════
   ORDER STATUS TRANSITIONS & LIFECYCLE MANAGEMENT
   ═══════════════════════════════════════════════════════════════════════ */

export const PERMITTED_STATUS_TRANSITIONS: Record<string, string[]> = {
  placed: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["collected", "cancelled"],
  collected: [],
  cancelled: [],
};

export interface TransitionOrderStatusParams {
  db: FirebaseFirestore.Firestore;
  caller: {
    uid: string;
    email?: string;
    isAdmin: boolean;
  };
  orderId: string;
  newStatus: string;
  pickupCode?: string;
  note?: string;
}

export interface TransitionOrderStatusResult {
  success: boolean;
  orderId: string;
  previousStatus: string;
  newStatus: string;
  pickupVerified?: boolean;
}

/**
 * Authoritatively executes an order status transition with role-based validation,
 * sequence checking, terminal state protection, pickup code verification,
 * and automated inventory restoration on cancellation.
 */
export async function executeTransitionOrderStatus(
  params: TransitionOrderStatusParams
): Promise<TransitionOrderStatusResult> {
  const { db, caller, orderId, newStatus, pickupCode, note } = params;

  if (!orderId || typeof orderId !== "string") {
    throw new HttpsError("invalid-argument", "orderId is required.");
  }

  const validStatuses = ["placed", "accepted", "preparing", "ready_for_pickup", "collected", "cancelled"];
  if (!validStatuses.includes(newStatus)) {
    throw new HttpsError("invalid-argument", `Invalid target status '${newStatus}'. Allowed: ${validStatuses.join(", ")}`);
  }

  const orderRef = db.collection("orders").doc(orderId);

  const result = await db.runTransaction<any>(async (transaction) => {
    const snap = await transaction.get(orderRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Order ${orderId} does not exist.`);
    }

    const order = snap.data() || {};
    const currentStatus: string = order.orderStatus || "placed";

    // 1. Idempotency: If status is already newStatus, return success
    if (currentStatus === newStatus) {
      return {
        success: true,
        orderId,
        previousStatus: currentStatus,
        newStatus,
      };
    }

    // 2. Terminal state check: 'collected' and 'cancelled' are immutable final states
    if (currentStatus === "collected" || currentStatus === "cancelled") {
      throw new HttpsError(
        "failed-precondition",
        `Order is in terminal state '${currentStatus}' and cannot be transitioned further.`
      );
    }

    // 3. Permitted transition sequence validation
    const allowedTargets = PERMITTED_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedTargets.includes(newStatus)) {
      throw new HttpsError(
        "failed-precondition",
        `Invalid status transition: Cannot move from '${currentStatus}' to '${newStatus}'. Permitted next statuses: ${allowedTargets.join(", ") || "none"}.`
      );
    }

    // 4. Role-based authorization
    if (!caller.isAdmin) {
      // Non-admins (Customers) can ONLY cancel their own order, and ONLY if still in 'placed' status
      if (order.userId !== caller.uid) {
        throw new HttpsError("permission-denied", "You do not have permission to modify this order.");
      }

      if (newStatus !== "cancelled") {
        throw new HttpsError("permission-denied", "Customers can only request order cancellation.");
      }

      if (currentStatus !== "placed") {
        throw new HttpsError(
          "failed-precondition",
          "This order has already been processed by the dispensary and cannot be cancelled online. Please contact dispensary staff."
        );
      }

      if (order.paymentStatus === "paid") {
        throw new HttpsError(
          "failed-precondition",
          "This order has already been paid and cannot be cancelled online. Please contact dispensary staff."
        );
      }
    }

    // 5. Collection verification workflow (when advancing to 'collected')
    let pickupVerified = false;
    if (newStatus === "collected") {
      const attempts = Number(order.pickupAttempts || 0);
      const maxAttempts = Number(order.maxPickupAttempts || 5);

      if (attempts >= maxAttempts) {
        throw new HttpsError(
          "failed-precondition",
          "Pickup verification locked due to excessive failed attempts (>5). Please verify customer identity manually."
        );
      }

      const cleanCode = String(pickupCode || "").trim();
      const expectedCode = String(order.pickupCode || "").trim();

      if (!cleanCode || cleanCode !== expectedCode) {
        const nextAttempts = attempts + 1;
        transaction.update(orderRef, {
          pickupAttempts: nextAttempts,
          updatedAt: FieldValue.serverTimestamp(),
        });
        const remaining = Math.max(0, maxAttempts - nextAttempts);
        return {
          failedVerification: true,
          remaining,
          nextAttempts,
        };
      }

      pickupVerified = true;
    }

    // 6. Cancellation inventory restoration
    if (newStatus === "cancelled" && order.inventoryDeducted && !order.inventoryRestored) {
      const items = Array.isArray(order.items) ? order.items : [];
      for (const item of items) {
        if (!item.productId) continue;
        const prodRef = db.collection("products").doc(item.productId);
        const prodSnap = await transaction.get(prodRef);
        if (prodSnap.exists) {
          const currentStock = Number(prodSnap.data()?.stock ?? 0);
          const restoreQty = Number(item.quantity ?? 1);
          transaction.update(prodRef, {
            stock: currentStock + restoreQty,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }

    // 7. Record status transition audit log
    const actorRole = caller.isAdmin ? "admin" : "customer";
    const actorId = caller.email || caller.uid;
    const historyEntry = {
      eventType: "ORDER_STATUS_CHANGED",
      status: newStatus,
      timestamp: new Date().toISOString(),
      actor: actorRole,
      actorId,
      note: note || (newStatus === "collected" ? "Order collected and verified with 6-digit PIN at counter." : `Order status updated to ${newStatus}`),
    };

    const updatePayload: Record<string, any> = {
      orderStatus: newStatus,
      updatedAt: FieldValue.serverTimestamp(),
      statusHistory: FieldValue.arrayUnion(historyEntry),
    };

    if (newStatus === "collected") {
      updatePayload.collectedAt = FieldValue.serverTimestamp();
      updatePayload.collectedVerifiedBy = actorId;
    }

    if (newStatus === "cancelled") {
      updatePayload.cancelledAt = FieldValue.serverTimestamp();
      updatePayload.cancelledBy = actorId;
      updatePayload.cancelReason = note || "Order cancelled";
      if (order.inventoryDeducted && !order.inventoryRestored) {
        updatePayload.inventoryRestored = true;
        updatePayload.inventoryRestoredAt = FieldValue.serverTimestamp();
      }
    }

    transaction.update(orderRef, updatePayload);

    // 5. Append-only server audit log
    const auditRef = db.collection("audit_logs").doc();
    let auditAction = "ORDER_STATUS_CHANGED";
    let auditSummary = `Order #${orderId.slice(-6)} transitioned from '${currentStatus}' to '${newStatus}'.`;
    if (newStatus === "collected") {
      auditAction = "ORDER_COLLECTED";
      auditSummary = `Order #${orderId.slice(-6)} collected and verified with 6-digit PIN at dispensary counter by ${actorId}.`;
    } else if (newStatus === "cancelled") {
      auditAction = "ORDER_CANCELLED";
      auditSummary = `Order #${orderId.slice(-6)} was cancelled by ${actorId}. Reason: ${note || "Cancelled"}.`;
    }

    const auditPayload = cleanFirestorePayload({
      action: auditAction,
      actor: {
        uid: caller.uid,
        email: caller.email || undefined,
        role: actorRole,
      },
      target: {
        collection: "orders",
        id: orderId,
        label: `Order #${orderId.slice(-6)}`,
      },
      summary: auditSummary,
      changes: [
        { field: "orderStatus", before: currentStatus, after: newStatus },
      ],
      metadata: {
        pickupVerified,
        note: (typeof note === "string" && note.trim().length > 0) ? note.trim() : undefined,
      },
      timestamp: FieldValue.serverTimestamp(),
    });

    transaction.set(auditRef, auditPayload);

    return {
      success: true,
      orderId,
      previousStatus: currentStatus,
      newStatus,
      pickupVerified,
    };
  });

  if (result && (result as any).failedVerification) {
    const remaining = (result as any).remaining;
    throw new HttpsError(
      "invalid-argument",
      `Invalid 6-digit collection code. ${remaining} attempts remaining before lock.`
    );
  }

  return result as TransitionOrderStatusResult;
}

/* ═══════════════════════════════════════════════════════════════════════
   PAYMENT RECORDING (Strictly Decoupled from Fulfilment)
   ═══════════════════════════════════════════════════════════════════════ */

export interface RecordPaymentParams {
  db: FirebaseFirestore.Firestore;
  caller: {
    uid: string;
    email?: string;
    isAdmin: boolean;
  };
  orderId: string;
  note?: string;
}

export interface RecordPaymentResult {
  success: boolean;
  orderId: string;
  paymentStatus: "paid";
  paidAt: string;
  paidConfirmedBy: string;
  alreadyPaid?: boolean;
}

/**
 * Records receipt of in-person Cash/UPI payment at the dispensary counter.
 * Fulfilment status ('orderStatus') is NOT modified.
 */
export async function executeRecordPayment(
  params: RecordPaymentParams
): Promise<RecordPaymentResult> {
  const { db, caller, orderId, note } = params;

  if (!caller.isAdmin) {
    throw new HttpsError("permission-denied", "Only authorized dispensary staff can record payment receipt.");
  }

  if (!orderId || typeof orderId !== "string") {
    throw new HttpsError("invalid-argument", "orderId is required.");
  }

  const orderRef = db.collection("orders").doc(orderId);

  return await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(orderRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Order ${orderId} does not exist.`);
    }

    const order = snap.data() || {};

    if (order.orderStatus === "cancelled") {
      throw new HttpsError("failed-precondition", "Cannot record payment on a cancelled order.");
    }

    if (order.orderStatus !== "ready_for_pickup" && order.orderStatus !== "collected") {
      throw new HttpsError(
        "failed-precondition",
        "In-person payment can only be accepted once the order has been prepared and is ready for pickup or collected."
      );
    }

    const actorId = caller.email || caller.uid;
    const nowIso = new Date().toISOString();

    // Idempotent: If already marked paid
    if (order.paymentStatus === "paid") {
      return {
        success: true,
        orderId,
        paymentStatus: "paid",
        paidAt: order.paidAt?.toDate ? order.paidAt.toDate().toISOString() : nowIso,
        paidConfirmedBy: order.paidConfirmedBy || actorId,
        alreadyPaid: true,
      };
    }

    const historyEntry = {
      eventType: "PAYMENT_RECORDED",
      paymentStatus: "paid",
      timestamp: nowIso,
      actor: "admin",
      actorId,
      note: note || "In-person payment (Cash / UPI) confirmed received at dispensary counter.",
    };

    transaction.update(orderRef, {
      paymentStatus: "paid",
      paidAt: FieldValue.serverTimestamp(),
      paidConfirmedBy: actorId,
      statusHistory: FieldValue.arrayUnion(historyEntry),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Append-only server audit log
    const auditRef = db.collection("audit_logs").doc();
    const auditPayload = cleanFirestorePayload({
      action: "PAYMENT_RECORDED",
      actor: {
        uid: caller.uid,
        email: caller.email || undefined,
        role: "admin",
      },
      target: {
        collection: "orders",
        id: orderId,
        label: `Order #${orderId.slice(-6)}`,
      },
      summary: `In-person payment of ₹${((order.total || 0) / 100).toFixed(2)} confirmed received at counter by ${actorId}.`,
      changes: [
        { field: "paymentStatus", before: order.paymentStatus || "unpaid", after: "paid" },
      ],
      metadata: {
        totalPaise: order.total || 0,
        paidAt: nowIso,
        note: (typeof note === "string" && note.trim().length > 0) ? note.trim() : undefined,
      },
      timestamp: FieldValue.serverTimestamp(),
    });

    transaction.set(auditRef, auditPayload);

    return {
      success: true,
      orderId,
      paymentStatus: "paid",
      paidAt: nowIso,
      paidConfirmedBy: actorId,
    };
  });
}

export interface CorrectPaymentParams {
  db: FirebaseFirestore.Firestore;
  caller: {
    uid: string;
    email?: string;
    isAdmin: boolean;
  };
  orderId: string;
  correctedStatus: "paid" | "unpaid";
  correctionReason: string;
}

/**
 * Records an authorized in-person payment correction (e.g. counter cash error / reconciliation).
 */
export async function executeCorrectPayment(params: CorrectPaymentParams) {
  const { db, caller, orderId, correctedStatus, correctionReason } = params;

  if (!caller.isAdmin) {
    throw new HttpsError("permission-denied", "Only authorized dispensary staff can record payment corrections.");
  }

  if (!orderId || typeof orderId !== "string") {
    throw new HttpsError("invalid-argument", "orderId is required.");
  }

  if (!correctionReason || correctionReason.trim().length < 5) {
    throw new HttpsError("invalid-argument", "A valid reason (minimum 5 characters) is required for payment correction.");
  }

  const orderRef = db.collection("orders").doc(orderId);

  return await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(orderRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Order ${orderId} does not exist.`);
    }

    const order = snap.data() || {};
    const previousPaymentStatus = order.paymentStatus || "unpaid";
    const actorId = caller.email || caller.uid;
    const nowIso = new Date().toISOString();

    const historyEntry = {
      paymentStatus: correctedStatus,
      timestamp: nowIso,
      actor: "admin",
      actorId,
      note: `Payment Correction: ${correctionReason}`,
    };

    transaction.update(orderRef, {
      paymentStatus: correctedStatus,
      paymentCorrectionReason: correctionReason,
      paymentCorrectedAt: FieldValue.serverTimestamp(),
      paymentCorrectedBy: actorId,
      statusHistory: FieldValue.arrayUnion(historyEntry),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Append-only audit log
    const auditRef = db.collection("audit_logs").doc();
    transaction.set(auditRef, {
      action: "PAYMENT_CORRECTED",
      actor: {
        uid: caller.uid,
        email: caller.email || undefined,
        role: "admin",
      },
      target: {
        collection: "orders",
        id: orderId,
        label: `Order #${orderId.slice(-6)}`,
      },
      summary: `Payment status for Order #${orderId.slice(-6)} corrected from '${previousPaymentStatus}' to '${correctedStatus}'. Reason: ${correctionReason}`,
      changes: [
        { field: "paymentStatus", before: previousPaymentStatus, after: correctedStatus },
      ],
      metadata: {
        totalPaise: order.total || 0,
        correctionReason,
      },
      timestamp: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      orderId,
      previousPaymentStatus,
      correctedStatus,
      correctionReason,
      correctedBy: actorId,
    };
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   CALLABLE CLOUD FUNCTIONS
   ═══════════════════════════════════════════════════════════════════════ */

export interface UpdateOrderStatusRequestData {
  orderId: string;
  newStatus: string;
  pickupCode?: string;
  note?: string;
}

export const PRIMARY_SUPERADMIN_EMAIL = "akashprabhu0302@gmail.com";

export interface ResolvedOrderAdminStatus {
  isAdmin: boolean;
  isRevoked: boolean;
}

/**
 * Verifies caller's current authorization against trusted real-time server records.
 * Never trusts a cached Firebase custom claim alone.
 */
export async function verifyOrderAdminCaller(
  db: FirebaseFirestore.Firestore,
  uid: string,
  email?: string,
  hasAdminClaim?: boolean,
  emailVerified?: boolean
): Promise<ResolvedOrderAdminStatus> {
  const cleanEmail = email ? email.toLowerCase().trim() : "";
  const isEmailVerified = Boolean(emailVerified);
  const isSuperadmin = isEmailVerified && cleanEmail === PRIMARY_SUPERADMIN_EMAIL.toLowerCase();

  // 1. Superadmin always has admin privileges and can never be revoked
  if (isSuperadmin) {
    return { isAdmin: true, isRevoked: false };
  }

  // 2. Real-time revocation check: Revoked administrators are strictly blocked from admin privileges
  const revocationDoc = await db.collection("admin_revocations").doc(uid).get();
  if (revocationDoc.exists) {
    return { isAdmin: false, isRevoked: true };
  }

  // 3. Verify active administrator record in /admins/{uid}
  const adminDoc = await db.collection("admins").doc(uid).get();
  if (adminDoc.exists) {
    const adminData = adminDoc.data();
    if (adminData?.isActive === false) {
      return { isAdmin: false, isRevoked: false };
    }
    return { isAdmin: true, isRevoked: false };
  }

  // 4. Fallback: Check /admins by verified email
  if (cleanEmail && isEmailVerified) {
    const querySnap = await db.collection("admins").where("email", "==", cleanEmail).limit(1).get();
    if (!querySnap.empty && querySnap.docs[0].data()?.isActive !== false) {
      return { isAdmin: true, isRevoked: false };
    }
  }

  if (Boolean(hasAdminClaim)) {
    return { isAdmin: true, isRevoked: false };
  }

  return { isAdmin: false, isRevoked: false };
}

export const updateOrderStatus = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<UpdateOrderStatusRequestData>): Promise<TransitionOrderStatusResult> => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError("unauthenticated", "Authentication required to update order status.");
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email;
    const emailVerified = Boolean(request.auth.token.email_verified);
    const db = admin.firestore();

    const { isAdmin, isRevoked } = await verifyOrderAdminCaller(
      db,
      uid,
      email,
      Boolean(request.auth.token.admin),
      emailVerified
    );

    // If caller is revoked and attempting an admin status transition or another user's order, block immediately
    if (isRevoked && request.data.newStatus !== "cancelled") {
      throw new HttpsError("permission-denied", "Administrator privilege has been revoked for this account.");
    }

    try {
      return await executeTransitionOrderStatus({
        db,
        caller: { uid, email, isAdmin },
        orderId: request.data.orderId,
        newStatus: request.data.newStatus,
        pickupCode: request.data.pickupCode,
        note: request.data.note,
      });
    } catch (err: unknown) {
      if (err instanceof HttpsError) throw err;
      logger.error("updateOrderStatus failure:", err);
      throw new HttpsError("internal", "An error occurred while transitioning order status.");
    }
  }
);

export interface RecordPaymentRequestData {
  orderId: string;
  note?: string;
}

export const recordOrderPayment = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<RecordPaymentRequestData>): Promise<RecordPaymentResult> => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError("unauthenticated", "Authentication required to record order payment.");
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email;
    const emailVerified = Boolean(request.auth.token.email_verified);
    const db = admin.firestore();

    const { isAdmin, isRevoked } = await verifyOrderAdminCaller(
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
      throw new HttpsError("permission-denied", "Only authorized dispensary staff can record payment receipt.");
    }

    try {
      return await executeRecordPayment({
        db,
        caller: { uid, email, isAdmin },
        orderId: request.data.orderId,
        note: request.data.note,
      });
    } catch (err: unknown) {
      if (err instanceof HttpsError) throw err;
      logger.error("recordOrderPayment failure:", err);
      throw new HttpsError("internal", "An error occurred while recording payment.");
    }
  }
);

export interface CorrectPaymentRequestData {
  orderId: string;
  correctedStatus: "paid" | "unpaid";
  correctionReason: string;
}

export const correctOrderPayment = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<CorrectPaymentRequestData>) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError("unauthenticated", "Authentication required to correct order payment.");
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email;
    const emailVerified = Boolean(request.auth.token.email_verified);
    const db = admin.firestore();

    const { isAdmin, isRevoked } = await verifyOrderAdminCaller(
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
      throw new HttpsError("permission-denied", "Only authorized dispensary staff can record payment corrections.");
    }

    try {
      return await executeCorrectPayment({
        db,
        caller: { uid, email, isAdmin },
        orderId: request.data.orderId,
        correctedStatus: request.data.correctedStatus,
        correctionReason: request.data.correctionReason,
      });
    } catch (err: unknown) {
      if (err instanceof HttpsError) throw err;
      logger.error("correctOrderPayment failure:", err);
      throw new HttpsError("internal", "An error occurred while recording payment correction.");
    }
  }
);

