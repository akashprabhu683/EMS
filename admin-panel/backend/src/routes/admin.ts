import { Router, Request, Response, NextFunction } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomBytes, createHash } from 'node:crypto';
import { adminDb, adminAuth } from '../firebaseAdmin.js';

export const adminRouter = Router();

export const PRIMARY_SUPERADMIN_EMAIL = 'akashprabhu0302@gmail.com';

export interface AdminAuthenticatedRequest extends Request {
  adminUser?: {
    uid: string;
    email?: string;
    claims: Record<string, any>;
  };
}

/**
 * Middleware: Verifies Firebase ID token AND validates active admin privilege in real-time.
 * Blocks revoked administrators immediately via admin_revocations/{uid}.
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
    const email = (decoded.email || '').toLowerCase().trim();
    const isSuperadmin = email === PRIMARY_SUPERADMIN_EMAIL.toLowerCase();

    // 1. Real-time revocation check: Revoked administrators are strictly blocked
    const revocationDoc = await adminDb.collection('admin_revocations').doc(decoded.uid).get();
    if (revocationDoc.exists) {
      res.status(403).json({ error: 'Forbidden: Admin privilege has been revoked.' });
      return;
    }

    // 2. Real-time active admin check in /admins/{uid}
    let hasAdmin = isSuperadmin || Boolean(decoded.admin);
    const adminDoc = await adminDb.collection('admins').doc(decoded.uid).get();
    if (adminDoc.exists) {
      if (adminDoc.data()?.isActive === false && !isSuperadmin) {
        res.status(403).json({ error: 'Forbidden: Admin privilege has been deactivated.' });
        return;
      }
      hasAdmin = true;
    }

    if (!hasAdmin || (!adminDoc.exists && !isSuperadmin)) {
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
 * Updates order status according to permitted lifecycle transitions.
 * Permitted: placed -> accepted -> preparing -> ready_for_pickup -> collected
 * Cancellation allowed from any active state.
 * Terminal states: collected, cancelled.
 */
adminRouter.patch('/orders/:orderId/status', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const { orderId } = req.params;
  const targetStatus = req.body.orderStatus || req.body.status;
  const pickupCode = req.body.pickupCode;
  const note = req.body.note;
  const adminEmail = req.adminUser?.email || req.adminUser?.uid || 'admin';

  const validStatuses = ['placed', 'accepted', 'preparing', 'ready_for_pickup', 'collected', 'cancelled'];
  if (!targetStatus || !validStatuses.includes(targetStatus)) {
    res.status(400).json({ error: `Invalid order status. Allowed: ${validStatuses.join(', ')}` });
    return;
  }

  const PERMITTED_TRANSITIONS: Record<string, string[]> = {
    placed: ['accepted', 'cancelled'],
    accepted: ['preparing', 'cancelled'],
    preparing: ['ready_for_pickup', 'cancelled'],
    ready_for_pickup: ['collected', 'cancelled'],
    collected: [],
    cancelled: [],
  };

  try {
    const orderRef = adminDb.collection('orders').doc(orderId);

    const result = await adminDb.runTransaction(async (transaction) => {
      // 1. All Reads: Must execute before any writes
      const snap = await transaction.get(orderRef);

      if (!snap.exists) {
        const err: any = new Error(`Order ${orderId} not found.`);
        err.statusCode = 404;
        throw err;
      }

      const currentOrder = snap.data() || {};
      const currentStatus = currentOrder.orderStatus || 'placed';

      // 1.1 Idempotency check: If order is already in target status, return success
      if (currentStatus === targetStatus) {
        return { success: true, orderId, updatedStatus: targetStatus };
      }

      // 1.2 Terminal state check: 'collected' and 'cancelled' are immutable final states
      if (currentStatus === 'collected' || currentStatus === 'cancelled') {
        const err: any = new Error(`Order is in terminal state '${currentStatus}' and cannot be transitioned further.`);
        err.statusCode = 400;
        throw err;
      }

      // 1.3 Permitted transition sequence
      const allowed = PERMITTED_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(targetStatus)) {
        const err: any = new Error(`Invalid transition from '${currentStatus}' to '${targetStatus}'. Allowed: ${allowed.join(', ') || 'none'}`);
        err.statusCode = 400;
        throw err;
      }

      // 1.4 Collection verification workflow
      let pickupVerified = false;
      if (targetStatus === 'collected') {
        const attempts = Number(currentOrder.pickupAttempts || 0);
        const maxAttempts = Number(currentOrder.maxPickupAttempts || 5);

        if (attempts >= maxAttempts) {
          const err: any = new Error('Pickup verification locked due to excessive failed attempts (>5). Verify identity manually.');
          err.statusCode = 400;
          throw err;
        }

        const cleanCode = String(pickupCode || '').trim();
        const expectedCode = String(currentOrder.pickupCode || '').trim();

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

      // 1.5 Read product documents for inventory restoration (Read before write)
      const shouldRestoreInventory = targetStatus === 'cancelled' && currentOrder.inventoryDeducted && !currentOrder.inventoryRestored;
      const items = Array.isArray(currentOrder.items) ? currentOrder.items : [];
      const prodUpdates: Array<{ ref: FirebaseFirestore.DocumentReference; currentStock: number; restoreQty: number }> = [];

      if (shouldRestoreInventory) {
        for (const item of items) {
          if (!item.productId) continue;
          const prodRef = adminDb.collection('products').doc(item.productId);
          const prodSnap = await transaction.get(prodRef);
          if (prodSnap.exists) {
            const currentStock = Number(prodSnap.data()?.stock ?? 0);
            const restoreQty = Number(item.quantity ?? 1);
            prodUpdates.push({ ref: prodRef, currentStock, restoreQty });
          }
        }
      }

      // 2. All Writes: Committed atomically in the transaction
      // 2.1 Restore product inventory
      for (const update of prodUpdates) {
        transaction.update(update.ref, {
          stock: update.currentStock + update.restoreQty,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // 2.2 Update order document
      const historyEntry = {
        status: targetStatus,
        timestamp: new Date().toISOString(),
        actor: 'admin',
        actorId: adminEmail,
        note: note || (targetStatus === 'collected' ? 'Verified collection code at dispensary counter' : `Status advanced to ${targetStatus}`),
      };

      const updatePayload: Record<string, any> = {
        orderStatus: targetStatus,
        updatedAt: FieldValue.serverTimestamp(),
        statusHistory: FieldValue.arrayUnion(historyEntry),
      };

      if (targetStatus === 'collected') {
        updatePayload.collectedAt = FieldValue.serverTimestamp();
        updatePayload.collectedVerifiedBy = adminEmail;
      }

      if (targetStatus === 'cancelled') {
        updatePayload.cancelledAt = FieldValue.serverTimestamp();
        updatePayload.cancelledBy = adminEmail;
        updatePayload.cancelReason = note || 'Admin cancelled';
        if (shouldRestoreInventory) {
          updatePayload.inventoryRestored = true;
          updatePayload.inventoryRestoredAt = FieldValue.serverTimestamp();
        }
      }

      transaction.update(orderRef, updatePayload);

      // 2.3 Record server-side append-only audit trail atomically
      const auditRef = adminDb.collection('audit_logs').doc();
      transaction.set(auditRef, {
        action: targetStatus === 'collected' ? 'ORDER_COLLECTED' : targetStatus === 'cancelled' ? 'ORDER_CANCELLED' : 'ORDER_STATUS_CHANGED',
        actor: {
          uid: req.adminUser?.uid || 'admin',
          email: adminEmail,
          role: 'admin',
        },
        target: {
          collection: 'orders',
          id: orderId,
          label: `Order #${orderId.slice(-6)}`,
        },
        summary: `Order #${orderId.slice(-6)} updated to '${targetStatus}' by ${adminEmail}.`,
        changes: [{ field: 'orderStatus', before: currentStatus, after: targetStatus }],
        metadata: {
          pickupVerified,
          note: note || undefined,
        },
        timestamp: FieldValue.serverTimestamp(),
      });

      return { success: true, orderId, updatedStatus: targetStatus };
    });

    if (result && (result as any).failedVerification) {
      const remaining = (result as any).remaining;
      res.status(400).json({
        error: `Invalid 6-digit collection code. ${remaining} attempts remaining before lock.`,
      });
      return;
    }

    res.json(result);
  } catch (err: any) {
    console.error('Failed to update order status:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update order status.' });
  }
});

/**
 * PATCH /api/admin/orders/:orderId/payment
 * Records in-person payment (Cash/UPI) at dispensary counter.
 * Fulfilment status ('orderStatus') is strictly preserved and not modified.
 * Atomically committed via a Firestore transaction.
 */
adminRouter.patch('/orders/:orderId/payment', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const { orderId } = req.params;
  const { note } = req.body;
  const adminEmail = req.adminUser?.email || req.adminUser?.uid || 'admin';

  try {
    const orderRef = adminDb.collection('orders').doc(orderId);

    const result = await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(orderRef);

      if (!snap.exists) {
        const err: any = new Error(`Order ${orderId} not found.`);
        err.statusCode = 404;
        throw err;
      }

      const currentOrder = snap.data() || {};

      if (currentOrder.orderStatus === 'cancelled') {
        const err: any = new Error('Cannot record payment on a cancelled order.');
        err.statusCode = 400;
        throw err;
      }

      if (currentOrder.paymentStatus === 'paid') {
        return { success: true, orderId, paymentStatus: 'paid' };
      }

      const historyEntry = {
        paymentStatus: 'paid',
        timestamp: new Date().toISOString(),
        actor: 'admin',
        actorId: adminEmail,
        note: note || 'In-person payment (Cash / UPI) confirmed received at dispensary counter.',
      };

      transaction.update(orderRef, {
        paymentStatus: 'paid',
        paidAt: FieldValue.serverTimestamp(),
        paidConfirmedBy: adminEmail,
        statusHistory: FieldValue.arrayUnion(historyEntry),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Record server-side append-only audit trail atomically in transaction
      const auditRef = adminDb.collection('audit_logs').doc();
      transaction.set(auditRef, {
        action: 'PAYMENT_RECORDED',
        actor: {
          uid: req.adminUser?.uid || 'admin',
          email: adminEmail,
          role: 'admin',
        },
        target: {
          collection: 'orders',
          id: orderId,
          label: `Order #${orderId.slice(-6)}`,
        },
        summary: `In-person payment of ₹${Number(currentOrder.total || currentOrder.subtotal || 0) / 100} confirmed received at counter by ${adminEmail}.`,
        changes: [{ field: 'paymentStatus', before: currentOrder.paymentStatus || 'unpaid', after: 'paid' }],
        timestamp: FieldValue.serverTimestamp(),
      });

      return { success: true, orderId, paymentStatus: 'paid' };
    });

    res.json(result);
  } catch (err: any) {
    console.error('Failed to record order payment:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to record order payment.' });
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

// Helper for hashing tokens
function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function getCanonicalPortalUrl(): string {
  const url = process.env.FRONTEND_URL || process.env.ADMIN_PORTAL_URL || 'https://ems-admin-panel-provider.vercel.app';
  return url.replace(/\/$/, '');
}

/**
 * GET /api/admin/invitations
 * Lists all active administrators and invitations
 */
adminRouter.get('/invitations', requireAdminAuth, async (_req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const [adminsSnap, invitesSnap] = await Promise.all([
      adminDb.collection('admins').get(),
      adminDb.collection('admin_invitations').get(),
    ]);

    const admins: any[] = [];
    adminsSnap.forEach((doc) => {
      const data = doc.data();
      admins.push({
        uid: doc.id,
        email: data.email || '—',
        displayName: data.displayName || data.email?.split('@')[0] || 'Admin',
        role: data.role || 'admin',
        grantedBy: data.grantedBy || 'system',
        grantedAt: data.grantedAt?.toDate?.() ? data.grantedAt.toDate().toISOString() : data.grantedAt || null,
        photoURL: data.photoURL || null,
      });
    });

    const invitations: any[] = [];
    invitesSnap.forEach((doc) => {
      const data = doc.data();
      const status = data.status || 'pending';
      if (status !== 'pending') return;

      invitations.push({
        id: doc.id,
        email: data.email || doc.id,
        status: 'pending',
        invitedBy: data.invitedBy || 'Admin',
        invitedAt: data.invitedAt?.toDate?.() ? data.invitedAt.toDate().toISOString() : data.invitedAt || null,
        expiresAt: data.expiresAt?.toDate?.() ? data.expiresAt.toDate().toISOString() : data.expiresAt || null,
      });
    });

    res.json({ admins, invitations });
  } catch (err: any) {
    console.error('Failed to list administrators & invitations:', err);
    res.status(500).json({ error: 'Failed to list administrators & invitations.' });
  }
});

/**
 * POST /api/admin/invitations
 * Creates a persistent invitation with token, tokenHash, expiration, and canonical URL
 */
adminRouter.post('/invitations', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const callerEmail = req.adminUser?.email?.toLowerCase().trim();
  if (callerEmail !== PRIMARY_SUPERADMIN_EMAIL.toLowerCase()) {
    res.status(403).json({
      error: 'Only the primary site owner (akashprabhu0302@gmail.com) has authority to grant admin roles.',
    });
    return;
  }

  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'Valid email address is required.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const callerUid = req.adminUser?.uid || null;

  try {
    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const portalUrl = getCanonicalPortalUrl();
    const acceptUrl = `${portalUrl}/accept-invite?token=${token}&email=${encodeURIComponent(cleanEmail)}`;

    // Store only tokenHash and metadata in Firestore (never plaintext token or raw acceptUrl)
    await adminDb.collection('admin_invitations').doc(cleanEmail).set({
      email: cleanEmail,
      tokenHash,
      status: 'pending',
      invitedBy: callerEmail,
      invitedByUid: callerUid,
      invitedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      acceptedAt: null,
      acceptedByUid: null,
    });

    res.json({
      success: true,
      status: 'invited',
      acceptUrl,
      message: `Invitation generated for ${cleanEmail}. Link: ${acceptUrl}`,
    });
  } catch (err: any) {
    console.error('Failed to create invitation:', err);
    res.status(500).json({ error: err.message || 'Failed to create invitation.' });
  }
});

/**
 * GET /api/admin/invitations/verify
 * Public endpoint to verify token validity before acceptance
 */
adminRouter.get('/invitations/verify', async (req: Request, res: Response): Promise<void> => {
  const token = req.query.token as string;
  const email = req.query.email as string | undefined;

  if (!token) {
    res.status(400).json({ valid: false, reason: 'Invitation token is required.' });
    return;
  }

  const tokenStr = token.trim();
  const tokenHash = hashToken(tokenStr);
  const cleanEmail = email ? email.trim().toLowerCase() : null;

  try {
    let inviteDoc: FirebaseFirestore.DocumentSnapshot | null = null;

    if (cleanEmail) {
      const docSnap = await adminDb.collection('admin_invitations').doc(cleanEmail).get();
      if (docSnap.exists) {
        inviteDoc = docSnap;
      }
    }

    if (!inviteDoc) {
      const querySnap = await adminDb
        .collection('admin_invitations')
        .where('tokenHash', '==', tokenHash)
        .limit(1)
        .get();

      if (!querySnap.empty) {
        inviteDoc = querySnap.docs[0];
      } else {
        const rawSnap = await adminDb
          .collection('admin_invitations')
          .where('token', '==', tokenStr)
          .limit(1)
          .get();
        if (!rawSnap.empty) {
          inviteDoc = rawSnap.docs[0];
        }
      }
    }

    if (!inviteDoc || !inviteDoc.exists) {
      res.json({ valid: false, reason: 'No invitation exists for this link.' });
      return;
    }

    const data = inviteDoc.data() || {};
    if (data.status === 'accepted') {
      res.json({ valid: false, reason: 'This invitation has already been accepted.' });
      return;
    }
    if (data.status !== 'pending') {
      res.json({ valid: false, reason: 'This invitation is no longer active.' });
      return;
    }

    const tokenMatches = (data.tokenHash && data.tokenHash === tokenHash) || (data.token && data.token === tokenStr);
    if (!tokenMatches) {
      res.json({ valid: false, reason: 'Invalid invitation token.' });
      return;
    }

    if (data.expiresAt) {
      const expiry = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
      if (Date.now() > expiry.getTime()) {
        res.json({ valid: false, reason: 'This invitation has expired. Please request a new invitation.' });
        return;
      }
    }

    res.json({
      valid: true,
      email: data.email,
      invitedBy: data.invitedBy || 'EMS Administrator',
      status: 'pending',
    });
  } catch (err: any) {
    console.error('Failed to verify invitation:', err);
    res.status(500).json({ valid: false, reason: 'Failed to verify invitation.' });
  }
});

/**
 * POST /api/admin/invitations/accept
 * Authenticated user redeems an invitation.
 * Uses atomic Firestore transaction and grants admin custom claim.
 */
adminRouter.post('/invitations/accept', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'You must sign in with Google to accept this invitation.' });
    return;
  }

  const idToken = authHeader.split('Bearer ')[1].trim();
  const { token } = req.body;

  if (!token) {
    res.status(400).json({ error: 'Invitation token is required.' });
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!decoded.email) {
      res.status(400).json({ error: 'Authenticated account has no verified email address.' });
      return;
    }

    const userEmail = decoded.email.toLowerCase().trim();
    const uid = decoded.uid;
    const tokenStr = String(token).trim();
    const tokenHash = hashToken(tokenStr);

    const inviteDocRef = adminDb.collection('admin_invitations').doc(userEmail);
    const adminDocRef = adminDb.collection('admins').doc(uid);

    await adminDb.runTransaction(async (transaction) => {
      const inviteSnap = await transaction.get(inviteDocRef);
      if (!inviteSnap.exists) {
        throw new Error(`No invitation found for ${userEmail}. Please sign in with the invited email address.`);
      }

      const data = inviteSnap.data() || {};
      if (data.status === 'accepted') {
        throw new Error('This invitation has already been accepted.');
      }
      if (data.status !== 'pending') {
        throw new Error('This invitation is no longer valid.');
      }

      const tokenMatches = (data.tokenHash && data.tokenHash === tokenHash) || (data.token && data.token === tokenStr);
      if (!tokenMatches) {
        throw new Error('Invitation token mismatch.');
      }

      if (data.expiresAt) {
        const expiry = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
        if (Date.now() > expiry.getTime()) {
          throw new Error('This invitation has expired.');
        }
      }

      transaction.update(inviteDocRef, {
        status: 'accepted',
        acceptedAt: FieldValue.serverTimestamp(),
        acceptedByUid: uid,
      });

      transaction.set(adminDocRef, {
        uid,
        email: userEmail,
        displayName: decoded.name || userEmail.split('@')[0],
        photoURL: decoded.picture || null,
        role: 'admin',
        grantedBy: data.invitedBy || 'invitation',
        grantedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    // Grant Firebase Auth custom claim
    const userRecord = await adminAuth.getUser(uid);
    await adminAuth.setCustomUserClaims(uid, {
      ...(userRecord.customClaims || {}),
      admin: true,
    });

    res.json({
      success: true,
      message: 'Admin role activated successfully! You now have full administrator access.',
    });
  } catch (err: any) {
    console.error('Failed to accept invitation:', err);
    res.status(400).json({ error: err.message || 'Failed to accept invitation.' });
  }
});

/**
 * DELETE /api/admin/invitations/:email
 * Revokes invitation or removes administrator privileges
 */
adminRouter.delete('/invitations/:email', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const callerEmail = req.adminUser?.email?.toLowerCase().trim();
  if (callerEmail !== PRIMARY_SUPERADMIN_EMAIL.toLowerCase()) {
    res.status(403).json({
      error: 'Only the primary site owner (akashprabhu0302@gmail.com) has authority to revoke administrator accounts.',
    });
    return;
  }

  const { email } = req.params;
  const cleanEmail = email.trim().toLowerCase();

  if (cleanEmail === PRIMARY_SUPERADMIN_EMAIL.toLowerCase()) {
    res.status(403).json({
      error: 'The primary site owner (akashprabhu0302@gmail.com) cannot be revoked.',
    });
    return;
  }

  if (cleanEmail === callerEmail) {
    res.status(400).json({ error: 'You cannot revoke your own administrator account.' });
    return;
  }

  try {
    let targetUid: string | null = null;
    try {
      const user = await adminAuth.getUserByEmail(cleanEmail);
      targetUid = user.uid;
    } catch {
      // User may not have registered in Auth yet
    }

    if (targetUid) {
      const user = await adminAuth.getUser(targetUid);
      const { admin: _, ...remainingClaims } = (user.customClaims || {}) as any;
      await adminAuth.setCustomUserClaims(targetUid, {
        ...remainingClaims,
        admin: false,
      });
      await adminDb.collection('admins').doc(targetUid).delete();

      // Write immediate real-time revocation marker document
      await adminDb.collection('admin_revocations').doc(targetUid).set({
        uid: targetUid,
        email: cleanEmail,
        revokedAt: FieldValue.serverTimestamp(),
        revokedBy: callerEmail,
      }).catch(() => {});
    }

    await adminDb.collection('admin_invitations').doc(cleanEmail).delete().catch(() => {});

    res.json({
      success: true,
      message: `Admin access and invitations removed for ${cleanEmail}.`,
    });
  } catch (err: any) {
    console.error('Failed to revoke admin:', err);
    res.status(500).json({ error: err.message || 'Failed to revoke administrator.' });
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   PRODUCT & CATEGORY MUTATION ENDPOINTS (PHASE 6C)
   Authoritative backend execution, transaction isolation, and audit trail.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * POST /api/admin/products
 * Creates a new product with server-side validation and audit log.
 */
adminRouter.post('/products', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const caller = req.adminUser!;
  const { name, description, categoryId, priceRupees, pricePaise, stock, lowStockThreshold, isActive, imageUrl } = req.body;

  const cleanName = String(name || '').trim();
  if (cleanName.length < 2 || cleanName.length > 200) {
    res.status(400).json({ error: 'Product name must be between 2 and 200 characters.' });
    return;
  }

  const cleanDesc = String(description || '').trim();
  if (cleanDesc.length < 2 || cleanDesc.length > 5000) {
    res.status(400).json({ error: 'Product description must be between 2 and 5000 characters.' });
    return;
  }

  const cleanCat = String(categoryId || '').trim();
  if (!cleanCat) {
    res.status(400).json({ error: 'Please select a valid category.' });
    return;
  }

  try {
    const catSnap = await adminDb.collection('categories').doc(cleanCat).get();
    if (!catSnap.exists) {
      res.status(400).json({ error: `Category "${cleanCat}" does not exist in the database.` });
      return;
    }

    let finalPricePaise = 0;
    if (pricePaise !== undefined) {
      finalPricePaise = Number(pricePaise);
    } else if (priceRupees !== undefined) {
      const pNum = parseFloat(priceRupees);
      if (isNaN(pNum) || pNum <= 0) {
        res.status(400).json({ error: 'Price must be a valid positive number.' });
        return;
      }
      finalPricePaise = Math.round(pNum * 100);
    } else {
      res.status(400).json({ error: 'Price is required.' });
      return;
    }

    if (!Number.isSafeInteger(finalPricePaise) || finalPricePaise <= 0 || finalPricePaise > 10000000) {
      res.status(400).json({ error: 'Price must be a valid positive integer in paise (up to ₹1,00,000).' });
      return;
    }

    const stockNum = Number(stock);
    if (!Number.isSafeInteger(stockNum) || stockNum < 0 || stockNum > 1000000) {
      res.status(400).json({ error: 'Stock must be a non-negative whole integer (0 to 1,000,000).' });
      return;
    }

    const threshNum = lowStockThreshold !== undefined ? Number(lowStockThreshold) : 5;
    if (!Number.isSafeInteger(threshNum) || threshNum < 0) {
      res.status(400).json({ error: 'Low-stock threshold must be a non-negative whole integer.' });
      return;
    }

    const cleanImg = imageUrl && typeof imageUrl === 'string' ? imageUrl.trim() : '';
    if (cleanImg && !cleanImg.startsWith('https://') && !cleanImg.startsWith('data:image/')) {
      res.status(400).json({ error: 'Image URL must be a secure HTTPS link or valid image data.' });
      return;
    }

    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    const stableId = `prod_${slug}_${Date.now().toString(36)}`;

    const now = FieldValue.serverTimestamp();
    const productPayload: Record<string, any> = {
      id: stableId,
      name: cleanName,
      description: cleanDesc,
      categoryId: cleanCat,
      category: cleanCat,
      categorySlug: cleanCat,
      price: finalPricePaise,
      stock: stockNum,
      lowStockThreshold: threshNum,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      isLowStock: stockNum > 0 && stockNum <= threshNum,
      isOutOfStock: stockNum === 0,
      imageUrl: cleanImg || undefined,
      images: cleanImg ? [cleanImg] : [],
      rating: 4.5,
      reviewCount: 0,
      featured: false,
      isNew: true,
      tags: [],
      auditLoggedDirectly: true,
      createdAt: now,
      updatedAt: now,
    };

    const batch = adminDb.batch();
    batch.set(adminDb.collection('products').doc(stableId), productPayload);
    batch.set(adminDb.collection('audit_logs').doc(), {
      action: 'PRODUCT_CREATED',
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: 'admin',
      },
      target: {
        collection: 'products',
        id: stableId,
        label: cleanName,
      },
      summary: `Product "${cleanName}" created with stock of ${stockNum} units and price ₹${(finalPricePaise / 100).toFixed(2)} by ${caller.email || caller.uid}.`,
      metadata: {
        pricePaise: finalPricePaise,
        stock: stockNum,
        categoryId: cleanCat,
      },
      timestamp: now,
    });

    await batch.commit();
    res.status(201).json({ productId: stableId, success: true });
  } catch (err: any) {
    console.error('Failed to create product:', err);
    res.status(500).json({ error: err.message || 'Failed to create product.' });
  }
});

/**
 * PATCH /api/admin/products/:productId
 * Atomically updates a product in a transaction to prevent race conditions.
 */
adminRouter.patch('/products/:productId', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const caller = req.adminUser!;
  const { productId } = req.params;
  const { name, description, categoryId, priceRupees, pricePaise, stock, expectedCurrentStock, lowStockThreshold, isActive, imageUrl } = req.body;

  try {
    const prodRef = adminDb.collection('products').doc(productId);

    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(prodRef);
      if (!snap.exists) {
        const err: any = new Error(`Product "${productId}" does not exist.`);
        err.statusCode = 404;
        throw err;
      }

      const current = snap.data() || {};
      const changes: Array<{ field: string; before: any; after: any }> = [];
      const updates: Record<string, any> = {
        updatedAt: FieldValue.serverTimestamp(),
        auditLoggedDirectly: true,
      };

      if (name !== undefined) {
        const cleanName = String(name).trim();
        if (cleanName.length < 2 || cleanName.length > 200) {
          const err: any = new Error('Product name must be between 2 and 200 characters.');
          err.statusCode = 400;
          throw err;
        }
        if (cleanName !== current.name) {
          changes.push({ field: 'name', before: current.name, after: cleanName });
          updates.name = cleanName;
        }
      }

      if (description !== undefined) {
        const cleanDesc = String(description).trim();
        if (cleanDesc.length < 2 || cleanDesc.length > 5000) {
          const err: any = new Error('Product description must be between 2 and 5000 characters.');
          err.statusCode = 400;
          throw err;
        }
        if (cleanDesc !== current.description) {
          changes.push({ field: 'description', before: current.description, after: cleanDesc });
          updates.description = cleanDesc;
        }
      }

      if (categoryId !== undefined) {
        const cleanCat = String(categoryId).trim();
        if (cleanCat !== current.categoryId) {
          const catSnap = await transaction.get(adminDb.collection('categories').doc(cleanCat));
          if (!catSnap.exists) {
            const err: any = new Error(`Category "${cleanCat}" does not exist.`);
            err.statusCode = 400;
            throw err;
          }
          changes.push({ field: 'categoryId', before: current.categoryId, after: cleanCat });
          updates.categoryId = cleanCat;
          updates.category = cleanCat;
          updates.categorySlug = cleanCat;
        }
      }

      let newPricePaise: number | undefined = undefined;
      if (pricePaise !== undefined) {
        newPricePaise = Number(pricePaise);
      } else if (priceRupees !== undefined) {
        const pNum = parseFloat(priceRupees);
        if (isNaN(pNum) || pNum <= 0) {
          const err: any = new Error('Price must be a valid positive number.');
          err.statusCode = 400;
          throw err;
        }
        newPricePaise = Math.round(pNum * 100);
      }

      if (newPricePaise !== undefined) {
        if (!Number.isSafeInteger(newPricePaise) || newPricePaise <= 0 || newPricePaise > 10000000) {
          const err: any = new Error('Price must be a valid positive integer in paise (up to ₹1,00,000).');
          err.statusCode = 400;
          throw err;
        }
        if (newPricePaise !== current.price) {
          changes.push({ field: 'price', before: current.price, after: newPricePaise });
          updates.price = newPricePaise;
        }
      }

      let lowStockThreshold = Number(current.lowStockThreshold ?? 5);
      if (lowStockThreshold !== undefined && req.body.lowStockThreshold !== undefined) {
        const thresh = Number(req.body.lowStockThreshold);
        if (!Number.isSafeInteger(thresh) || thresh < 0) {
          const err: any = new Error('Low-stock threshold must be a non-negative whole integer.');
          err.statusCode = 400;
          throw err;
        }
        if (thresh !== lowStockThreshold) {
          changes.push({ field: 'lowStockThreshold', before: lowStockThreshold, after: thresh });
          updates.lowStockThreshold = thresh;
          lowStockThreshold = thresh;
        }
      }

      let currentStock = Number(current.stock ?? 0);
      if (stock !== undefined) {
        const stockNum = Number(stock);
        if (!Number.isSafeInteger(stockNum) || stockNum < 0 || stockNum > 1000000) {
          const err: any = new Error('Stock must be a non-negative whole integer (0 to 1,000,000).');
          err.statusCode = 400;
          throw err;
        }

        if (expectedCurrentStock !== undefined) {
          const expectedNum = Number(expectedCurrentStock);
          if (expectedNum !== currentStock) {
            const err: any = new Error(
              `Stock conflict: Product stock was modified concurrently (current: ${currentStock}, expected: ${expectedNum}). Please refresh before updating stock.`
            );
            err.statusCode = 409;
            throw err;
          }
        }

        if (stockNum !== currentStock) {
          changes.push({ field: 'stock', before: currentStock, after: stockNum });
          updates.stock = stockNum;
          currentStock = stockNum;
        }
      }

      updates.isLowStock = currentStock > 0 && currentStock <= lowStockThreshold;
      updates.isOutOfStock = currentStock === 0;

      if (isActive !== undefined) {
        const isAct = Boolean(isActive);
        if (isAct !== Boolean(current.isActive)) {
          changes.push({ field: 'isActive', before: current.isActive, after: isAct });
          updates.isActive = isAct;
        }
      }

      if (imageUrl !== undefined) {
        const cleanImg = String(imageUrl || '').trim();
        if (cleanImg && !cleanImg.startsWith('https://') && !cleanImg.startsWith('data:image/')) {
          const err: any = new Error('Image URL must be a secure HTTPS link or valid image data.');
          err.statusCode = 400;
          throw err;
        }
        if (cleanImg !== (current.imageUrl || '')) {
          changes.push({ field: 'imageUrl', before: current.imageUrl, after: cleanImg });
          updates.imageUrl = cleanImg;
          updates.images = cleanImg ? [cleanImg] : [];
        }
      }

      if (changes.length === 0) return;

      transaction.update(prodRef, updates);

      const hasStockChange = changes.some((c) => c.field === 'stock');
      const isStockOnly = changes.length === 1 && hasStockChange;
      const action = isStockOnly ? 'INVENTORY_ADJUSTED' : 'PRODUCT_UPDATED';
      const prodName = updates.name || current.name || productId;

      transaction.set(adminDb.collection('audit_logs').doc(), {
        action,
        actor: {
          uid: caller.uid,
          email: caller.email,
          role: 'admin',
        },
        target: {
          collection: 'products',
          id: productId,
          label: prodName,
        },
        summary: isStockOnly
          ? `Stock for "${prodName}" adjusted from ${changes[0].before} to ${changes[0].after} units by ${caller.email || caller.uid}.`
          : `Product "${prodName}" updated (${changes.map((c) => c.field).join(', ')}) by ${caller.email || caller.uid}.`,
        changes,
        timestamp: FieldValue.serverTimestamp(),
      });
    });

    res.json({ productId, success: true });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.message || 'Failed to update product.' });
  }
});

/**
 * PATCH /api/admin/products/:productId/stock
 * Dedicated atomic inventory adjustment.
 */
adminRouter.patch('/products/:productId/stock', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const caller = req.adminUser!;
  const { productId } = req.params;
  const { adjustmentType, value, reason } = req.body;

  if (adjustmentType !== 'set' && adjustmentType !== 'delta') {
    res.status(400).json({ error: "adjustmentType must be either 'set' or 'delta'." });
    return;
  }

  const numVal = Number(value);
  if (!Number.isSafeInteger(numVal)) {
    res.status(400).json({ error: 'Adjustment value must be a safe integer.' });
    return;
  }

  try {
    const prodRef = adminDb.collection('products').doc(productId);

    const result = await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(prodRef);
      if (!snap.exists) {
        const err: any = new Error(`Product "${productId}" does not exist.`);
        err.statusCode = 404;
        throw err;
      }

      const current = snap.data() || {};
      const currentStock = Number(current.stock ?? 0);
      const lowStockThreshold = Number(current.lowStockThreshold ?? 5);

      let newStock = currentStock;
      if (adjustmentType === 'set') {
        if (numVal < 0) {
          const err: any = new Error('Target stock cannot be negative.');
          err.statusCode = 400;
          throw err;
        }
        newStock = numVal;
      } else {
        newStock = currentStock + numVal;
        if (newStock < 0) {
          const err: any = new Error(`Cannot reduce stock by ${Math.abs(numVal)}. Available stock is only ${currentStock}.`);
          err.statusCode = 400;
          throw err;
        }
      }

      const isLowStock = newStock > 0 && newStock <= lowStockThreshold;
      const isOutOfStock = newStock === 0;

      transaction.update(prodRef, {
        stock: newStock,
        isLowStock,
        isOutOfStock,
        auditLoggedDirectly: true,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const prodName = current.name || productId;
      const cleanReason = String(reason || 'Manual inventory adjustment').trim();

      transaction.set(adminDb.collection('audit_logs').doc(), {
        action: 'INVENTORY_ADJUSTED',
        actor: {
          uid: caller.uid,
          email: caller.email,
          role: 'admin',
        },
        target: {
          collection: 'products',
          id: productId,
          label: prodName,
        },
        summary: `Stock for "${prodName}" adjusted from ${currentStock} to ${newStock} (${adjustmentType === 'delta' ? (numVal >= 0 ? `+${numVal}` : `${numVal}`) : `set to ${numVal}`}). Reason: ${cleanReason}.`,
        changes: [{ field: 'stock', before: currentStock, after: newStock }],
        metadata: {
          adjustmentType,
          value: numVal,
          reason: cleanReason,
        },
        timestamp: FieldValue.serverTimestamp(),
      });

      return { productId, previousStock: currentStock, newStock, success: true };
    });

    res.json(result);
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.message || 'Failed to adjust stock.' });
  }
});

/**
 * PATCH /api/admin/products/:productId/status
 * Authoritatively toggles product active status.
 */
adminRouter.patch('/products/:productId/status', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const caller = req.adminUser!;
  const { productId } = req.params;
  const { isActive } = req.body;

  if (isActive === undefined) {
    res.status(400).json({ error: 'isActive boolean is required.' });
    return;
  }

  const isAct = Boolean(isActive);

  try {
    const prodRef = adminDb.collection('products').doc(productId);

    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(prodRef);
      if (!snap.exists) {
        const err: any = new Error(`Product "${productId}" does not exist.`);
        err.statusCode = 404;
        throw err;
      }

      const current = snap.data() || {};
      const beforeStatus = Boolean(current.isActive);
      if (beforeStatus === isAct) return;

      transaction.update(prodRef, {
        isActive: isAct,
        auditLoggedDirectly: true,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const prodName = current.name || productId;
      transaction.set(adminDb.collection('audit_logs').doc(), {
        action: 'PRODUCT_UPDATED',
        actor: {
          uid: caller.uid,
          email: caller.email,
          role: 'admin',
        },
        target: {
          collection: 'products',
          id: productId,
          label: prodName,
        },
        summary: `Product "${prodName}" ${isAct ? 'activated' : 'deactivated'} by ${caller.email || caller.uid}.`,
        changes: [{ field: 'isActive', before: beforeStatus, after: isAct }],
        timestamp: FieldValue.serverTimestamp(),
      });
    });

    res.json({ productId, isActive: isAct, success: true });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.message || 'Failed to toggle product status.' });
  }
});

/**
 * DELETE /api/admin/products/:productId
 * Physical deletion of products is strictly prohibited to prevent race conditions with
 * concurrent order placement and protect historical order integrity.
 * Clients must deactivate products instead.
 */
adminRouter.delete('/products/:productId', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const { productId } = req.params;

  try {
    const prodRef = adminDb.collection('products').doc(productId);
    const prodSnap = await prodRef.get();
    if (!prodSnap.exists) {
      res.status(404).json({ error: `Product "${productId}" does not exist.` });
      return;
    }

    res.status(400).json({
      error: 'Physical deletion of catalog products is prohibited to protect historical and concurrent order integrity. Please deactivate the product instead.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete product.' });
  }
});

/**
 * POST /api/admin/categories
 * Creates a category with concurrency-safe slug uniqueness enforced via a category_slugs document lock.
 */
adminRouter.post('/categories', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const caller = req.adminUser!;
  const { name, slug, description, isActive } = req.body;

  const cleanName = String(name || '').trim();
  if (cleanName.length < 2 || cleanName.length > 100) {
    res.status(400).json({ error: 'Category name must be between 2 and 100 characters.' });
    return;
  }

  const cleanSlug = String(slug || '').toLowerCase().trim();
  if (!cleanSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
    res.status(400).json({
      error: 'Slug must only contain lowercase alphanumeric characters and single hyphens (e.g. "ayurvedic-oils").',
    });
    return;
  }

  const now = FieldValue.serverTimestamp();
  const catRef = adminDb.collection('categories').doc();
  const catId = catRef.id;
  const slugLockRef = adminDb.collection('category_slugs').doc(cleanSlug);
  const auditRef = adminDb.collection('audit_logs').doc();

  try {
    await adminDb.runTransaction(async (transaction) => {
      const slugLockSnap = await transaction.get(slugLockRef);
      if (slugLockSnap.exists) {
        const err: any = new Error(`The slug "${cleanSlug}" is already in use by another category.`);
        err.statusCode = 409;
        throw err;
      }

      transaction.set(slugLockRef, {
        categoryId: catId,
        slug: cleanSlug,
        createdAt: now,
      });

      transaction.set(catRef, {
        id: catId,
        name: cleanName,
        slug: cleanSlug,
        description: typeof description === 'string' ? description.trim() : '',
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        createdAt: now,
        updatedAt: now,
      });

      transaction.set(auditRef, {
        action: 'CATEGORY_CREATED',
        actor: {
          uid: caller.uid,
          email: caller.email,
          role: 'admin',
        },
        target: {
          collection: 'categories',
          id: catId,
          label: cleanName,
        },
        summary: `Category "${cleanName}" (slug: ${cleanSlug}) created by ${caller.email || caller.uid}.`,
        metadata: {
          slug: cleanSlug,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
        },
        timestamp: now,
      });
    });

    res.status(201).json({ categoryId: catId, success: true });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.message || 'Failed to create category.' });
  }
});

/**
 * PATCH /api/admin/categories/:categoryId
 * Updates a category with atomic slug uniqueness checking and transactionally-committed audit logging.
 */
adminRouter.patch('/categories/:categoryId', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const caller = req.adminUser!;
  const { categoryId } = req.params;
  const { name, slug, description, isActive } = req.body;

  try {
    const catRef = adminDb.collection('categories').doc(categoryId);

    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(catRef);
      if (!snap.exists) {
        const err: any = new Error(`Category "${categoryId}" does not exist.`);
        err.statusCode = 404;
        throw err;
      }

      const current = snap.data() || {};
      const changes: Array<{ field: string; before: any; after: any }> = [];
      const updates: Record<string, any> = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (name !== undefined) {
        const cleanName = String(name).trim();
        if (cleanName.length < 2 || cleanName.length > 100) {
          const err: any = new Error('Category name must be between 2 and 100 characters.');
          err.statusCode = 400;
          throw err;
        }
        if (cleanName !== current.name) {
          changes.push({ field: 'name', before: current.name, after: cleanName });
          updates.name = cleanName;
        }
      }

      if (slug !== undefined) {
        const cleanSlug = String(slug).toLowerCase().trim();
        if (!cleanSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
          const err: any = new Error('Slug must only contain lowercase alphanumeric characters and single hyphens (e.g. "ayurvedic-oils").');
          err.statusCode = 400;
          throw err;
        }
        if (cleanSlug !== current.slug) {
          const newSlugLockRef = adminDb.collection('category_slugs').doc(cleanSlug);
          const newSlugSnap = await transaction.get(newSlugLockRef);
          if (newSlugSnap.exists && newSlugSnap.data()?.categoryId !== categoryId) {
            const err: any = new Error(`The slug "${cleanSlug}" is already in use by another category.`);
            err.statusCode = 409;
            throw err;
          }

          if (current.slug) {
            transaction.delete(adminDb.collection('category_slugs').doc(current.slug));
          }
          transaction.set(newSlugLockRef, {
            categoryId,
            slug: cleanSlug,
            updatedAt: FieldValue.serverTimestamp(),
          });

          changes.push({ field: 'slug', before: current.slug, after: cleanSlug });
          updates.slug = cleanSlug;
        }
      }

      if (description !== undefined) {
        const cleanDesc = String(description).trim();
        if (cleanDesc !== (current.description || '')) {
          changes.push({ field: 'description', before: current.description, after: cleanDesc });
          updates.description = cleanDesc;
        }
      }

      if (isActive !== undefined) {
        const isAct = Boolean(isActive);
        if (isAct !== Boolean(current.isActive)) {
          changes.push({ field: 'isActive', before: current.isActive, after: isAct });
          updates.isActive = isAct;
        }
      }

      if (changes.length === 0) return;

      transaction.update(catRef, updates);

      const catName = updates.name || current.name || categoryId;
      const auditRef = adminDb.collection('audit_logs').doc();
      transaction.set(auditRef, {
        action: 'CATEGORY_UPDATED',
        actor: {
          uid: caller.uid,
          email: caller.email,
          role: 'admin',
        },
        target: {
          collection: 'categories',
          id: categoryId,
          label: catName,
        },
        summary: `Category "${catName}" updated (${changes.map((c) => c.field).join(', ')}) by ${caller.email || caller.uid}.`,
        changes,
        timestamp: FieldValue.serverTimestamp(),
      });
    });

    res.json({ categoryId, success: true });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.message || 'Failed to update category.' });
  }
});

/**
 * PATCH /api/admin/categories/:categoryId/status
 * Authoritatively toggles category active status.
 */
adminRouter.patch('/categories/:categoryId/status', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const caller = req.adminUser!;
  const { categoryId } = req.params;
  const { isActive } = req.body;

  if (isActive === undefined) {
    res.status(400).json({ error: 'isActive boolean is required.' });
    return;
  }

  const isAct = Boolean(isActive);

  try {
    const catRef = adminDb.collection('categories').doc(categoryId);
    const snap = await catRef.get();
    if (!snap.exists) {
      res.status(404).json({ error: `Category "${categoryId}" does not exist.` });
      return;
    }

    const current = snap.data() || {};
    const beforeStatus = Boolean(current.isActive);
    if (beforeStatus === isAct) {
      res.json({ categoryId, isActive: isAct, success: true });
      return;
    }

    const catName = current.name || categoryId;
    const batch = adminDb.batch();
    batch.update(catRef, {
      isActive: isAct,
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(adminDb.collection('audit_logs').doc(), {
      action: 'CATEGORY_UPDATED',
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: 'admin',
      },
      target: {
        collection: 'categories',
        id: categoryId,
        label: catName,
      },
      summary: `Category "${catName}" ${isAct ? 'activated' : 'deactivated'} by ${caller.email || caller.uid}.`,
      changes: [{ field: 'isActive', before: beforeStatus, after: isAct }],
      timestamp: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    res.json({ categoryId, isActive: isAct, success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle category status.' });
  }
});

/**
 * DELETE /api/admin/categories/:categoryId
 * Physical deletion of categories is strictly prohibited to protect catalog referential integrity.
 * Clients must deactivate categories instead.
 */
adminRouter.delete('/categories/:categoryId', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const { categoryId } = req.params;

  try {
    const catRef = adminDb.collection('categories').doc(categoryId);
    const snap = await catRef.get();
    if (!snap.exists) {
      res.status(404).json({ error: `Category "${categoryId}" does not exist.` });
      return;
    }

    res.status(400).json({
      error: 'Physical deletion of categories is prohibited to protect catalog referential integrity. Please deactivate the category instead.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete category.' });
  }
});

