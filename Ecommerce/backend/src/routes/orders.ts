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
 * POST /api/orders
 * Transactionally creates an order, locks and decrements inventory, and clears user cart.
 */
ordersRouter.post('/', authenticateFirebaseToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const { shippingAddress, idempotencyKey, paymentMethod } = req.body;

  if (!shippingAddress || typeof shippingAddress !== 'object') {
    res.status(400).json({ error: 'Invalid shipping address.' });
    return;
  }

  const normalizedMethod = String(paymentMethod || 'cod').toLowerCase();
  const validMethods = ['cod', 'card', 'upi', 'netbanking'];
  if (!validMethods.includes(normalizedMethod)) {
    res.status(400).json({ error: `Invalid payment method: ${normalizedMethod}` });
    return;
  }

  try {
    const cartRef = adminDb.collection('carts').doc(uid);
    const cartSnap = await cartRef.get();

    if (!cartSnap.exists || !cartSnap.data()?.items || !Array.isArray(cartSnap.data()?.items) || cartSnap.data()?.items.length === 0) {
      res.status(400).json({ error: 'Your cart is empty. Please add items before checking out.' });
      return;
    }

    const cartItems: any[] = cartSnap.data()!.items;

    // Idempotency check if idempotencyKey was provided
    if (idempotencyKey && typeof idempotencyKey === 'string') {
      const existingIdemp = await adminDb.collection('idempotency_keys').doc(idempotencyKey).get();
      if (existingIdemp.exists) {
        const data = existingIdemp.data();
        if (data && data.orderId) {
          const cachedOrder = await adminDb.collection('orders').doc(data.orderId).get();
          if (cachedOrder.exists) {
            res.status(200).json({
              orderId: cachedOrder.id,
              ...cachedOrder.data(),
              isIdempotentReplay: true,
            });
            return;
          }
        }
      }
    }

    // Run ACID transaction to lock products, deduct stock, create order, and clear cart
    const orderResult = await adminDb.runTransaction(async (txn) => {
      let subtotalPaise = 0;
      const orderItems = [];

      for (const item of cartItems) {
        const productId = String(item.productId || item.id);
        const quantity = Number(item.quantity);

        if (!productId || quantity <= 0) {
          throw new Error(`Invalid cart item productId=${productId}`);
        }

        const productRef = adminDb.collection('products').doc(productId);
        const pSnap = await txn.get(productRef);

        if (!pSnap.exists) {
          throw new Error(`Product ${productId} not found in catalog.`);
        }

        const pData = pSnap.data()!;
        if (pData.isActive !== true) {
          throw new Error(`Product "${pData.name}" is no longer available.`);
        }

        const currentStock = Number(pData.stock);
        if (currentStock < quantity) {
          throw new Error(`Insufficient stock for "${pData.name}". Available: ${currentStock}, requested: ${quantity}.`);
        }

        const pricePaise = Number(pData.price); // paise
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

        // Deduct inventory
        txn.update(productRef, {
          stock: currentStock - quantity,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const shippingFeePaise = subtotalPaise >= FREE_SHIPPING_THRESHOLD_PAISE ? 0 : STANDARD_SHIPPING_FEE_PAISE;
      const codFeePaise = normalizedMethod === 'cod' ? COD_FEE_PAISE : 0;
      const totalPaise = subtotalPaise + shippingFeePaise + codFeePaise;

      const orderRef = adminDb.collection('orders').doc();
      const orderRecord = {
        id: orderRef.id,
        userId: uid,
        items: orderItems,
        subtotal: subtotalPaise,
        shippingFee: shippingFeePaise,
        codFee: codFeePaise,
        total: totalPaise,
        shippingAddress: {
          name: shippingAddress.name || `${shippingAddress.firstName || ''} ${shippingAddress.lastName || ''}`.trim(),
          phone: shippingAddress.phone || '',
          line1: shippingAddress.address || shippingAddress.line1 || '',
          city: shippingAddress.city || '',
          state: shippingAddress.state || '',
          postalCode: shippingAddress.zip || shippingAddress.postalCode || '',
          country: shippingAddress.country || 'IN',
        },
        orderStatus: 'confirmed',
        paymentStatus: normalizedMethod === 'cod' ? 'pending' : 'paid',
        paymentMethod: normalizedMethod,
        itemCount: orderItems.reduce((acc, it) => acc + it.quantity, 0),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      txn.set(orderRef, orderRecord);

      // Record idempotency key if provided
      if (idempotencyKey && typeof idempotencyKey === 'string') {
        const idempRef = adminDb.collection('idempotency_keys').doc(idempotencyKey);
        txn.set(idempRef, {
          orderId: orderRef.id,
          userId: uid,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // Clear the user's cart
      txn.set(cartRef, { items: [], updatedAt: FieldValue.serverTimestamp() });

      return {
        orderId: orderRef.id,
        subtotalPaise,
        shippingFeePaise,
        codFeePaise,
        totalPaise,
        subtotalRupees: subtotalPaise / 100,
        totalRupees: totalPaise / 100,
        orderStatus: orderRecord.orderStatus,
        paymentStatus: orderRecord.paymentStatus,
        paymentMethod: orderRecord.paymentMethod,
        itemCount: orderRecord.itemCount,
      };
    });

    res.status(201).json(orderResult);
  } catch (err: any) {
    console.error('Order creation failed:', err);
    res.status(400).json({ error: err.message || 'Order creation failed.' });
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
