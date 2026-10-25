import { Router, Request, Response, NextFunction } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminAuth } from '../firebaseAdmin.js';
import crypto from 'crypto';

export const ordersRouter = Router();

const FREE_SHIPPING_THRESHOLD_PAISE = 99_900; // Free shipping at or above ₹999
const STANDARD_SHIPPING_FEE_PAISE = 4_900;    // ₹49
const COD_FEE_PAISE = 4_900;                  // ₹49 COD fee

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
  };
}

export async function authenticateFirebaseToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token.' });
    return;
  }

  const token = authHeader.split('Bearer ')[1].trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired Firebase ID token.', details: err.message });
  }
}

/**
 * Validates the idempotency key format to prevent malformed or injection keys.
 */
export function validateIdempotencyKey(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new Error('idempotencyKey must be a string.');
  }

  const key = raw.trim();
  if (key.length < 8 || key.length > 128) {
    throw new Error('idempotencyKey must be between 8 and 128 characters.');
  }

  const validKeyRegex = /^[A-Za-z0-9_\-\.:]+$/;
  if (!validKeyRegex.test(key)) {
    throw new Error('idempotencyKey contains invalid characters.');
  }

  return key;
}

/**
 * Computes a deterministic SHA-256 fingerprint of the normalized order request.
 * Matches Cloud Functions implementation for cross-backend idempotency interoperability.
 */
export function computeRequestFingerprint(
  uid: string,
  items: Array<{ productId: string; quantity: number; selectedColor?: string; selectedSize?: string }>,
  contact: { fullName: string; phone: string; notes?: string },
  paymentMethod: string
): string {
  const sortedItems = [...items].sort((a, b) => a.productId.localeCompare(b.productId));
  const payload = JSON.stringify({
    uid,
    items: sortedItems,
    contact: {
      fullName: contact.fullName,
      phone: contact.phone,
      notes: contact.notes || '',
    },
    paymentMethod,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * POST /api/orders
 * Transactionally creates an order, locks and decrements inventory, clears user cart,
 * and maintains cross-backend idempotency records shared with Cloud Functions.
 */
ordersRouter.post('/', authenticateFirebaseToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const { pickupContact, shippingAddress, idempotencyKey } = req.body;

  const contactData = pickupContact || shippingAddress;
  if (!contactData || typeof contactData !== 'object') {
    res.status(400).json({ error: 'Pickup contact details (name and phone) are required.' });
    return;
  }

  const fullName = String(contactData.fullName || contactData.name || '').trim();
  const phone = String(contactData.phone || '').trim();
  if (!fullName || fullName.length < 2) {
    res.status(400).json({ error: 'Please enter a valid customer full name.' });
    return;
  }
  if (!phone || phone.length < 7) {
    res.status(400).json({ error: 'Please enter a valid phone number for pickup confirmation.' });
    return;
  }

  let cleanIdempotencyKey: string | null = null;
  if (idempotencyKey !== undefined && idempotencyKey !== null) {
    try {
      cleanIdempotencyKey = validateIdempotencyKey(idempotencyKey);
    } catch (keyErr: any) {
      res.status(400).json({ error: keyErr.message || 'Invalid idempotencyKey.' });
      return;
    }
  }

  try {
    const cartRef = adminDb.collection('carts').doc(uid);
    // Standard shared idempotency collection and document naming convention: idempotency_records/${uid}_${idempotencyKey}
    const idempRef = cleanIdempotencyKey
      ? adminDb.collection('idempotency_records').doc(`${uid}_${cleanIdempotencyKey}`)
      : null;
    // Backward compatibility fallback reference for legacy pre-Phase-6B records
    const legacyIdempRef = cleanIdempotencyKey
      ? adminDb.collection('idempotency_keys').doc(cleanIdempotencyKey)
      : null;

    // Run ACID transaction with STRICT READS-BEFORE-WRITES execution
    const orderResult = await adminDb.runTransaction(async (txn) => {
      /* ─────────────────────────────────────────────────────────────
         STEP 1: ALL READS (Must execute before any transaction writes)
         ───────────────────────────────────────────────────────────── */
      const cartSnap = await txn.get(cartRef);
      const idempSnap = idempRef ? await txn.get(idempRef) : null;
      const legacyIdempSnap = legacyIdempRef ? await txn.get(legacyIdempRef) : null;

      // Check for existing idempotency record (from Cloud Functions or Express)
      let existingIdemp: FirebaseFirestore.DocumentData | null = null;
      if (idempSnap && idempSnap.exists) {
        existingIdemp = idempSnap.data() || null;
      } else if (legacyIdempSnap && legacyIdempSnap.exists) {
        const legData = legacyIdempSnap.data();
        if (legData && (legData.userId === uid || legData.uid === uid)) {
          existingIdemp = legData;
        }
      }

      if (existingIdemp) {
        // If cart or body has items, verify request fingerprint has not changed
        const rawItemsForFp = (cartSnap.exists && Array.isArray(cartSnap.data()?.items) && cartSnap.data()!.items.length > 0)
          ? cartSnap.data()!.items
          : (Array.isArray(req.body.items) ? req.body.items : []);

        if (rawItemsForFp.length > 0) {
          const pMap = new Map<string, { quantity: number; selectedColor?: string; selectedSize?: string }>();
          for (const item of rawItemsForFp) {
            const pid = String(item.productId || item.id || '').trim();
            if (pid) {
              pMap.set(pid, {
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
            { fullName, phone, notes: contactData.notes || '' },
            'click_and_collect'
          );

          if (existingIdemp.requestFingerprint && existingIdemp.requestFingerprint !== currentFp) {
            const err: any = new Error('This idempotency key was previously used with different order details. Please supply a fresh idempotency key.');
            err.statusCode = 409;
            throw err;
          }
        }

        // Return cached idempotency response
        if (existingIdemp.response) {
          return existingIdemp.response;
        }
        if (existingIdemp.orderId) {
          const cachedOrder = await txn.get(adminDb.collection('orders').doc(existingIdemp.orderId));
          if (cachedOrder.exists) {
            const cachedData = cachedOrder.data();
            if (cachedData && cachedData.userId === uid) {
              return {
                orderId: cachedOrder.id,
                ...cachedData,
                isIdempotentReplay: true,
              };
            }
          }
        }
      }

      // New Order Execution: Cart must exist and have items
      const rawCartList = (cartSnap.exists && Array.isArray(cartSnap.data()?.items) && cartSnap.data()!.items.length > 0)
        ? cartSnap.data()!.items
        : (Array.isArray(req.body.items) ? req.body.items : []);

      if (rawCartList.length === 0) {
        const err: any = new Error('Your cart is empty. Please add items before checking out.');
        err.statusCode = 400;
        throw err;
      }

      // Aggregate product quantities
      const productQtyMap = new Map<string, number>();
      for (const item of rawCartList) {
        const productId = String(item.productId || item.id || '').trim();
        const quantity = Number(item.quantity);
        if (!productId || !Number.isSafeInteger(quantity) || quantity <= 0) {
          const err: any = new Error(`Invalid cart item configuration: productId=${productId}`);
          err.statusCode = 400;
          throw err;
        }
        productQtyMap.set(productId, (productQtyMap.get(productId) || 0) + quantity);
      }

      const productIds = Array.from(productQtyMap.keys());
      const productRefs = productIds.map((pid) => adminDb.collection('products').doc(pid));
      const productSnaps = await Promise.all(productRefs.map((ref) => txn.get(ref)));

      /* ─────────────────────────────────────────────────────────────
         STEP 2: IN-MEMORY VALIDATION & REVENUE COMPUTATION
         ───────────────────────────────────────────────────────────── */
      const productMap = new Map<string, FirebaseFirestore.DocumentData>();
      for (let i = 0; i < productIds.length; i++) {
        const pSnap = productSnaps[i];
        const pid = productIds[i];

        if (!pSnap.exists) {
          const err: any = new Error(`Product ${pid} not found in catalog.`);
          err.statusCode = 404;
          throw err;
        }

        const pData = pSnap.data()!;
        if (pData.isActive !== true) {
          const err: any = new Error(`Product "${pData.name || pid}" is no longer available.`);
          err.statusCode = 400;
          throw err;
        }

        const currentStock = Number(pData.stock ?? 0);
        const requestedQty = productQtyMap.get(pid)!;
        if (currentStock < requestedQty) {
          const err: any = new Error(`Insufficient stock for "${pData.name || pid}". Available: ${currentStock}, requested: ${requestedQty}.`);
          err.statusCode = 400;
          throw err;
        }

        productMap.set(pid, pData);
      }

      let subtotalPaise = 0;
      const orderItems = [];

      for (const item of rawCartList) {
        const productId = String(item.productId || item.id).trim();
        const quantity = Number(item.quantity);
        const pData = productMap.get(productId)!;
        const pricePaise = Number(pData.price);
        const lineTotalPaise = pricePaise * quantity;
        subtotalPaise += lineTotalPaise;

        orderItems.push({
          productId,
          name: pData.name,
          unitPrice: pricePaise,
          quantity,
          lineTotal: lineTotalPaise,
          imageUrl: pData.imageUrl || (Array.isArray(pData.images) ? pData.images[0] : null),
          selectedColor: item.selectedColor || null,
          selectedSize: item.selectedSize || null,
        });
      }

      const shippingFeePaise = 0;
      const codFeePaise = 0;
      const totalPaise = subtotalPaise;
      const DEFAULT_PICKUP_LOCATION = "EMS Herbal & Ayurvedic Dispensary, Main Road Health Complex (Opp. City Wellness Center), Pin: 560001";
      const pickupCode = crypto.randomInt(100000, 1000000).toString();

      const orderRef = adminDb.collection('orders').doc();
      const orderRecord = {
        id: orderRef.id,
        userId: uid,
        items: orderItems,
        subtotal: subtotalPaise,
        subtotalPaise,
        shippingFee: shippingFeePaise,
        shippingFeePaise,
        codFee: codFeePaise,
        codFeePaise,
        total: totalPaise,
        totalPaise,
        fulfillmentMethod: 'click_and_collect',
        pickupContact: {
          fullName,
          phone,
          notes: contactData.notes || '',
        },
        pickupLocation: DEFAULT_PICKUP_LOCATION,
        pickupCode,
        pickupAttempts: 0,
        maxPickupAttempts: 5,
        inventoryDeducted: true,
        orderStatus: 'placed',
        paymentStatus: 'unpaid',
        paymentMethod: 'click_and_collect',
        itemCount: orderItems.reduce((acc, it) => acc + it.quantity, 0),
        statusHistory: [
          {
            status: 'placed',
            timestamp: new Date().toISOString(),
            actor: 'customer',
            actorId: uid,
            note: 'Order placed for Click-and-Collect. Awaiting dispensary confirmation.',
          },
        ],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      const responsePayload = {
        orderId: orderRef.id,
        subtotal: subtotalPaise,
        subtotalPaise,
        shippingFee: shippingFeePaise,
        shippingFeePaise,
        codFee: codFeePaise,
        codFeePaise,
        total: totalPaise,
        totalPaise,
        subtotalRupees: subtotalPaise / 100,
        totalRupees: totalPaise / 100,
        orderStatus: orderRecord.orderStatus,
        paymentStatus: orderRecord.paymentStatus,
        paymentMethod: orderRecord.paymentMethod,
        itemCount: orderRecord.itemCount,
        pickupLocation: DEFAULT_PICKUP_LOCATION,
        pickupCode,
        createdAt: new Date().toISOString(),
      };

      // Compute request fingerprint for the new order
      const currentFingerprint = computeRequestFingerprint(
        uid,
        orderItems.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          selectedColor: it.selectedColor || undefined,
          selectedSize: it.selectedSize || undefined,
        })),
        { fullName, phone, notes: contactData.notes || '' },
        'click_and_collect'
      );

      /* ─────────────────────────────────────────────────────────────
         STEP 3: ALL WRITES (Atomically committed)
         ───────────────────────────────────────────────────────────── */
      // 3.1 Create order
      txn.set(orderRef, orderRecord);

      // 3.2 Deduct inventory with authoritative low-stock indicators
      for (const [pid, deductedQty] of productQtyMap.entries()) {
        const prodRef = adminDb.collection('products').doc(pid);
        const pData = productMap.get(pid)!;
        const currentStock = Number(pData.stock ?? 0);
        const newStock = Math.max(0, currentStock - deductedQty);
        const threshold = Number(pData.lowStockThreshold ?? 5);

        txn.update(prodRef, {
          stock: newStock,
          isLowStock: newStock > 0 && newStock <= threshold,
          isOutOfStock: newStock <= 0,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // 3.3 Save standardized idempotency record with request fingerprint and response cache
      if (idempRef && cleanIdempotencyKey) {
        txn.set(idempRef, {
          uid,
          idempotencyKey: cleanIdempotencyKey,
          orderId: orderRef.id,
          pickupContact: {
            fullName,
            phone,
            notes: contactData.notes || '',
          },
          paymentMethod: 'click_and_collect',
          requestFingerprint: currentFingerprint,
          response: responsePayload,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // 3.4 Clear user's remote cart
      txn.set(cartRef, { items: [], updatedAt: FieldValue.serverTimestamp() });

      // 3.5 Append-only audit record
      const auditRef = adminDb.collection('audit_logs').doc();
      txn.set(auditRef, {
        timestamp: FieldValue.serverTimestamp(),
        actor: {
          uid,
          role: 'customer',
        },
        action: 'ORDER_PLACED',
        targetCollection: 'orders',
        targetId: orderRef.id,
        orderId: orderRef.id,
        summary: `Click-and-Collect order placed by customer (${orderItems.length} items, ₹${totalPaise / 100})`,
        metadata: {
          itemCount: orderRecord.itemCount,
          totalPaise,
        },
      });

      return responsePayload;
    });

    res.status(201).json(orderResult);
  } catch (err: any) {
    console.error('Order creation failed:', err);
    res.status(err.statusCode || 400).json({ error: err.message || 'Order creation failed.' });
  }
});

/**
 * GET /api/orders/user/:uid
 */
ordersRouter.get('/user/:uid', authenticateFirebaseToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const requesterUid = req.user!.uid;
  const targetUid = req.params.uid;

  if (requesterUid !== targetUid) {
    res.status(403).json({ error: 'Forbidden: You cannot access orders belonging to another user.' });
    return;
  }

  try {
    const snap = await adminDb.collection('orders').where('userId', '==', targetUid).orderBy('createdAt', 'desc').get();
    const orders = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ orders });
  } catch (err: any) {
    console.error('Fetch orders error:', err);
    res.status(500).json({ error: 'Failed to retrieve orders.' });
  }
});
