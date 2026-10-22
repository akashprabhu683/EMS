import { Router, Request, Response, NextFunction } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomBytes, createHash } from 'node:crypto';
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
    let hasAdmin = Boolean(decoded.admin);
    if (!hasAdmin) {
      const adminDoc = await adminDb.collection('admins').doc(decoded.uid).get();
      if (adminDoc.exists) {
        hasAdmin = true;
      }
    }
    if (!hasAdmin) {
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
    const snap = await orderRef.get();

    if (!snap.exists) {
      res.status(404).json({ error: `Order ${orderId} not found.` });
      return;
    }

    const currentOrder = snap.data() || {};
    const currentStatus = currentOrder.orderStatus || 'placed';

    if (currentStatus === targetStatus) {
      res.json({ success: true, orderId, updatedStatus: targetStatus });
      return;
    }

    if (currentStatus === 'collected' || currentStatus === 'cancelled') {
      res.status(400).json({
        error: `Order is in terminal state '${currentStatus}' and cannot be transitioned further.`,
      });
      return;
    }

    const allowed = PERMITTED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      res.status(400).json({
        error: `Invalid transition from '${currentStatus}' to '${targetStatus}'. Allowed: ${allowed.join(', ') || 'none'}`,
      });
      return;
    }

    // Collection verification workflow
    if (targetStatus === 'collected') {
      const attempts = Number(currentOrder.pickupAttempts || 0);
      const maxAttempts = Number(currentOrder.maxPickupAttempts || 5);

      if (attempts >= maxAttempts) {
        res.status(400).json({
          error: 'Pickup verification locked due to excessive failed attempts (>5). Verify identity manually.',
        });
        return;
      }

      const cleanCode = String(pickupCode || '').trim();
      const expectedCode = String(currentOrder.pickupCode || '').trim();

      if (!cleanCode || cleanCode !== expectedCode) {
        await orderRef.update({
          pickupAttempts: attempts + 1,
          updatedAt: FieldValue.serverTimestamp(),
        });
        const remaining = Math.max(0, maxAttempts - (attempts + 1));
        res.status(400).json({
          error: `Invalid 6-digit collection code. ${remaining} attempts remaining before lock.`,
        });
        return;
      }
    }

    // Inventory restoration on cancellation
    if (targetStatus === 'cancelled' && currentOrder.inventoryDeducted && !currentOrder.inventoryRestored) {
      const items = Array.isArray(currentOrder.items) ? currentOrder.items : [];
      for (const item of items) {
        if (!item.productId) continue;
        const prodRef = adminDb.collection('products').doc(item.productId);
        const prodSnap = await prodRef.get();
        if (prodSnap.exists) {
          const currentStock = Number(prodSnap.data()?.stock ?? 0);
          const restoreQty = Number(item.quantity ?? 1);
          await prodRef.update({
            stock: currentStock + restoreQty,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }

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
      if (currentOrder.inventoryDeducted && !currentOrder.inventoryRestored) {
        updatePayload.inventoryRestored = true;
        updatePayload.inventoryRestoredAt = FieldValue.serverTimestamp();
      }
    }

    await orderRef.update(updatePayload);
    res.json({ success: true, orderId, updatedStatus: targetStatus });
  } catch (err: any) {
    console.error('Failed to update order status:', err);
    res.status(500).json({ error: 'Failed to update order status.' });
  }
});

/**
 * PATCH /api/admin/orders/:orderId/payment
 * Records in-person payment (Cash/UPI) at dispensary counter.
 * Fulfilment status ('orderStatus') is strictly preserved and not modified.
 */
adminRouter.patch('/orders/:orderId/payment', requireAdminAuth, async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  const { orderId } = req.params;
  const { note } = req.body;
  const adminEmail = req.adminUser?.email || req.adminUser?.uid || 'admin';

  try {
    const orderRef = adminDb.collection('orders').doc(orderId);
    const snap = await orderRef.get();

    if (!snap.exists) {
      res.status(404).json({ error: `Order ${orderId} not found.` });
      return;
    }

    const currentOrder = snap.data() || {};

    if (currentOrder.orderStatus === 'cancelled') {
      res.status(400).json({ error: 'Cannot record payment on a cancelled order.' });
      return;
    }

    if (currentOrder.paymentStatus === 'paid') {
      res.json({ success: true, orderId, paymentStatus: 'paid' });
      return;
    }

    const historyEntry = {
      paymentStatus: 'paid',
      timestamp: new Date().toISOString(),
      actor: 'admin',
      actorId: adminEmail,
      note: note || 'In-person payment (Cash / UPI) confirmed received at dispensary counter.',
    };

    await orderRef.update({
      paymentStatus: 'paid',
      paidAt: FieldValue.serverTimestamp(),
      paidConfirmedBy: adminEmail,
      statusHistory: FieldValue.arrayUnion(historyEntry),
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, orderId, paymentStatus: 'paid' });
  } catch (err: any) {
    console.error('Failed to record order payment:', err);
    res.status(500).json({ error: 'Failed to record order payment.' });
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
        token: data.token || null,
        acceptUrl: data.acceptUrl || null,
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
export const PRIMARY_SUPERADMIN_EMAIL = 'akashprabhu0302@gmail.com';

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

    await adminDb.collection('admin_invitations').doc(cleanEmail).set({
      email: cleanEmail,
      token,
      tokenHash,
      status: 'pending',
      invitedBy: callerEmail,
      invitedByUid: callerUid,
      invitedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      acceptedAt: null,
      acceptedByUid: null,
      acceptUrl,
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

    const tokenMatches = data.token === tokenStr || data.tokenHash === tokenHash;
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

      const tokenMatches = data.token === tokenStr || data.tokenHash === tokenHash;
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
