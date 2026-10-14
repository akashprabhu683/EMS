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
  selectedColor?: string;
  selectedSize?: string;
  imageUrl?: string;
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

    // 1.2 Read authenticated customer's cart
    const cartSnap = await transaction.get(cartRef);

    // If an idempotency record already exists, validate it and handle retry
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
        selectedColor: cartItem.selectedColor,
        selectedSize: cartItem.selectedSize,
        imageUrl,
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
    const DEFAULT_PICKUP_LOCATION = "EMS Herbal & Ayurvedic Dispensary, Main Road Health Complex (Opp. City Wellness Center), Pin: 560001";

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
      orderStatus: "placed",
      paymentStatus: "unpaid",
      paymentMethod: "click_and_collect",
      idempotencyKey,
      statusHistory: [
        {
          status: "placed",
          timestamp: new Date().toISOString(),
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
      createdAt: new Date().toISOString(),
    };

    /* ─────────────────────────────────────────────────────────────
       STEP 3: ALL WRITES (Atomically committed)
       ───────────────────────────────────────────────────────────── */

    // 3.1 Create immutable order snapshot
    transaction.set(orderRef, orderRecord);

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
