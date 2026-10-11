import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/* ═══════════════════════════════════════════════════════════════════════
   TYPES & CONTRACTS
   ═══════════════════════════════════════════════════════════════════════ */

export interface ShippingAddressInput {
  name?: string;
  fullName?: string;
  phone: string;
  line1?: string;
  address?: string;
  line2?: string;
  city: string;
  state: string;
  postalCode?: string;
  zip?: string;
  country?: string;
}

export interface NormalizedShippingAddress {
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface CreateOrderRequestData {
  shippingAddress: ShippingAddressInput;
  idempotencyKey: string;
  paymentMethod: string;
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
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  itemCount: number;
  createdAt: string; // ISO string
}

/* ═══════════════════════════════════════════════════════════════════════
   INPUT VALIDATION HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Validates and normalizes shipping address inputs into a standard schema.
 */
export function validateAndNormalizeAddress(raw: unknown): NormalizedShippingAddress {
  if (typeof raw !== "object" || raw === null) {
    throw new HttpsError("invalid-argument", "Shipping address is required and must be an object.");
  }

  const addr = raw as Record<string, unknown>;

  const name = typeof addr.name === "string" ? addr.name.trim() : (typeof addr.fullName === "string" ? addr.fullName.trim() : "");
  if (!name || name.length < 2 || name.length > 100) {
    throw new HttpsError("invalid-argument", "A valid full name (2-100 characters) is required in the shipping address.");
  }

  const phone = typeof addr.phone === "string" ? addr.phone.trim() : "";
  const phoneRegex = /^[0-9+\s\-()]{7,20}$/;
  if (!phone || !phoneRegex.test(phone)) {
    throw new HttpsError("invalid-argument", "A valid phone number (7-20 digits) is required in the shipping address.");
  }

  const line1 = typeof addr.line1 === "string" ? addr.line1.trim() : (typeof addr.address === "string" ? addr.address.trim() : "");
  if (!line1 || line1.length < 3 || line1.length > 200) {
    throw new HttpsError("invalid-argument", "A valid street address line 1 (3-200 characters) is required.");
  }

  const line2 = typeof addr.line2 === "string" && addr.line2.trim().length > 0 ? addr.line2.trim().slice(0, 200) : undefined;

  const city = typeof addr.city === "string" ? addr.city.trim() : "";
  if (!city || city.length < 2 || city.length > 100) {
    throw new HttpsError("invalid-argument", "A valid city name (2-100 characters) is required.");
  }

  const state = typeof addr.state === "string" ? addr.state.trim() : "";
  if (!state || state.length < 2 || state.length > 100) {
    throw new HttpsError("invalid-argument", "A valid state name (2-100 characters) is required.");
  }

  const postalCode = typeof addr.postalCode === "string" ? addr.postalCode.trim() : (typeof addr.zip === "string" ? addr.zip.trim() : "");
  if (!postalCode || postalCode.length < 3 || postalCode.length > 20) {
    throw new HttpsError("invalid-argument", "A valid postal code (3-20 characters) is required.");
  }

  const country = typeof addr.country === "string" && addr.country.trim().length > 0 ? addr.country.trim().toUpperCase() : "IN";

  return {
    name,
    phone,
    line1,
    line2,
    city,
    state,
    postalCode,
    country,
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
 * Validates the payment method. For Phase 2, strictly Cash on Delivery (COD) is supported.
 * Online payment methods are safely rejected with actionable guidance until Phase 3.
 */
export function validatePaymentMethod(raw: unknown): "cod" {
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", "paymentMethod is required.");
  }

  const method = raw.trim().toLowerCase();
  if (method === "cod") {
    return "cod";
  }

  if (["razorpay", "card", "upi", "netbanking", "stripe"].includes(method)) {
    throw new HttpsError(
      "failed-precondition",
      `Online payment method "${method}" is not yet supported. Please choose Cash on Delivery (COD) until Phase 3 payment gateway integration is enabled.`
    );
  }

  throw new HttpsError("invalid-argument", `Unsupported payment method "${raw}". Valid option: "cod".`);
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
  const normalizedAddress = validateAndNormalizeAddress(data?.shippingAddress);
  const paymentMethod = validatePaymentMethod(data?.paymentMethod);

  const idempotencyRef = db.collection("idempotency_records").doc(`${uid}_${idempotencyKey}`);
  const cartRef = db.collection("carts").doc(uid);

  return await db.runTransaction(async (transaction) => {
    /* ─────────────────────────────────────────────────────────────
       STEP 1: ALL READS (Must precede any writes in Firestore)
       ───────────────────────────────────────────────────────────── */

    // 1.1 Read idempotency record
    const idempotencySnap = await transaction.get(idempotencyRef);
    if (idempotencySnap.exists) {
      const existing = idempotencySnap.data();
      if (existing && existing.response) {
        return existing.response as CreateOrderResponse;
      }
    }

    // 1.2 Read authenticated customer's cart
    const cartSnap = await transaction.get(cartRef);
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

      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new HttpsError(
          "invalid-argument",
          `Invalid quantity (${quantity}) for product "${productId}". Quantity must be a positive integer.`
        );
      }

      if (quantity > 99) {
        throw new HttpsError(
          "invalid-argument",
          `Quantity for product "${productId}" exceeds maximum permitted limit (99).`
        );
      }

      if (productQuantityMap.has(productId)) {
        throw new HttpsError("invalid-argument", `Duplicate product ID "${productId}" in cart.`);
      }

      productQuantityMap.set(productId, {
        quantity,
        selectedColor: typeof item.selectedColor === "string" ? item.selectedColor : undefined,
        selectedSize: typeof item.selectedSize === "string" ? item.selectedSize : undefined,
      });
    }

    // 1.3 Read all authoritative product documents
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
      if (!Number.isInteger(price) || price < 0) {
        throw new HttpsError(
          "internal",
          `Product "${pData.name || pid}" has an invalid catalog price configuration.`
        );
      }

      const currentStock = Number(pData.stock);
      if (!Number.isInteger(currentStock) || currentStock < 0) {
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

      if (pData.prepaidOnly === true && paymentMethod === "cod") {
        throw new HttpsError(
          "failed-precondition",
          `Product "${pData.name || pid}" is marked as prepaid only and cannot be ordered with Cash on Delivery.`
        );
      }

      const lineTotal = price * cartItem.quantity;
      subtotal += lineTotal;

      const imageUrl =
        typeof pData.imageUrl === "string" && pData.imageUrl.startsWith("https://")
          ? pData.imageUrl
          : Array.isArray(pData.images) && typeof pData.images[0] === "string"
          ? pData.images[0]
          : undefined;

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

    if (subtotal <= 0) {
      throw new HttpsError("failed-precondition", "Order subtotal must be greater than zero.");
    }

    // Shipping fee rule: Free shipping on subtotal >= ₹999 (99,900 paise), else ₹49 (4,900 paise)
    const shippingFee = subtotal >= 99900 ? 0 : 4900;
    // Cash on Delivery fee: ₹49 (4,900 paise)
    const codFee = 4900;
    const total = subtotal + shippingFee + codFee;

    const orderRef = db.collection("orders").doc();
    const orderId = orderRef.id;
    const now = FieldValue.serverTimestamp();

    const orderRecord = {
      id: orderId,
      userId: uid,
      items: orderItems,
      subtotal,
      shippingFee,
      codFee,
      total,
      shippingAddress: normalizedAddress,
      orderStatus: "confirmed",
      paymentStatus: "cod_pending",
      paymentMethod: "cod",
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };

    const responsePayload: CreateOrderResponse = {
      orderId,
      subtotal,
      shippingFee,
      codFee,
      total,
      orderStatus: "confirmed",
      paymentStatus: "cod_pending",
      paymentMethod: "cod",
      itemCount: orderItems.reduce((sum, it) => sum + it.quantity, 0),
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

    // 3.3 Save idempotency record with cached response
    transaction.set(idempotencyRef, {
      uid,
      idempotencyKey,
      orderId,
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
      // Re-throw existing HttpsErrors directly
      if (err instanceof HttpsError) {
        throw err;
      }
      // Wrap unexpected runtime errors
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      throw new HttpsError("internal", `Order placement failed: ${message}`);
    }
  }
);
