import { Router, Request, Response, NextFunction } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminAuth } from '../firebaseAdmin.js';

export const adminRouter = Router();

export interface AdminAuthenticatedRequest extends Request {
  adminUser?: {
    uid: string;
    email?: string;
    claims: Record<string, any>;
  };
}

/**
 * Middleware: Verifies Firebase ID token AND validates admin claim.
 */
export async function requireAdminAuth(
  req: AdminAuthenticatedRequest,
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
    if (!decoded.admin) {
      res.status(403).json({ error: 'Forbidden: Admin privilege required.' });
      return;
    }
    req.adminUser = {
      uid: decoded.uid,
      email: decoded.email,
      claims: decoded,
    };
    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Unauthorized: Invalid token.', details: err.message });
  }
}

/**
 * POST /api/admin/verify
 * Validates admin status
 */
adminRouter.post('/verify', requireAdminAuth, (req: AdminAuthenticatedRequest, res: Response) => {
  res.json({
    status: 'ok',
    admin: true,
    user: req.adminUser,
  });
});

/**
 * GET /api/admin/stats
 * Dashboard overview aggregation
 */
adminRouter.get('/stats', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const [productsSnap, categoriesSnap, ordersSnap] = await Promise.all([
      adminDb.collection('products').get(),
      adminDb.collection('categories').get(),
      adminDb.collection('orders').get(),
    ]);

    const totalProducts = productsSnap.size;
    let lowStockCount = 0;
    let activeProductsCount = 0;

    productsSnap.forEach((doc) => {
      const p = doc.data();
      if (p.isActive) activeProductsCount++;
      if (Number(p.stock) <= 5) lowStockCount++;
    });

    const totalCategories = categoriesSnap.size;
    const totalOrders = ordersSnap.size;

    let revenuePaise = 0;
    ordersSnap.forEach((doc) => {
      const o = doc.data();
      if (o.paymentStatus === 'paid' || o.orderStatus === 'delivered') {
        revenuePaise += Number(o.total || 0);
      }
    });

    res.json({
      stats: {
        totalProducts,
        activeProductsCount,
        lowStockCount,
        totalCategories,
        totalOrders,
        revenueRupees: revenuePaise / 100,
      },
    });
  } catch (err: any) {
    console.error('Failed to aggregate stats:', err);
    res.status(500).json({ error: 'Failed to aggregate admin stats.' });
  }
});

/**
 * GET /api/admin/orders
 * Returns customer orders list
 */
adminRouter.get('/orders', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const statusFilter = req.query.status as string;
    let query: FirebaseFirestore.Query = adminDb.collection('orders');

    if (statusFilter && statusFilter !== 'all') {
      query = query.where('orderStatus', '==', statusFilter);
    }

    const snap = await query.orderBy('createdAt', 'desc').limit(100).get();
    const orders = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({ orders });
  } catch (err: any) {
    console.error('Failed to retrieve orders:', err);
    res.status(500).json({ error: 'Failed to retrieve orders.' });
  }
});

/**
 * PATCH /api/admin/orders/:orderId/status
 * Updates order status (e.g. confirmed -> processing -> shipped -> delivered -> cancelled)
 */
adminRouter.patch('/orders/:orderId/status', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const { orderId } = req.params;
  const { status, paymentStatus } = req.body;

  const validStatuses = ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid order status. Allowed: ${validStatuses.join(', ')}` });
    return;
  }

  try {
    const orderRef = adminDb.collection('orders').doc(orderId);
    const snap = await orderRef.get();

    if (!snap.exists) {
      res.status(404).json({ error: `Order ${orderId} not found.` });
      return;
    }

    const updatePayload: Record<string, any> = {
      orderStatus: status,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (paymentStatus) {
      updatePayload.paymentStatus = paymentStatus;
    }

    await orderRef.update(updatePayload);
    res.json({ success: true, orderId, updatedStatus: status });
  } catch (err: any) {
    console.error('Failed to update order status:', err);
    res.status(500).json({ error: 'Failed to update order status.' });
  }
});

/**
 * POST /api/admin/set-claim
 * Allows setting admin custom claims on a UID
 */
adminRouter.post('/set-claim', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const { targetUid, isAdmin } = req.body;

  if (!targetUid || typeof targetUid !== 'string') {
    res.status(400).json({ error: 'targetUid is required.' });
    return;
  }

  try {
    await adminAuth.setCustomUserClaims(targetUid, { admin: Boolean(isAdmin) });
    res.json({
      success: true,
      targetUid,
      admin: Boolean(isAdmin),
      message: `User ${targetUid} admin claim set to ${Boolean(isAdmin)}.`,
    });
  } catch (err: any) {
    console.error('Failed to set claim:', err);
    res.status(500).json({ error: err.message || 'Failed to update user claim.' });
  }
});
