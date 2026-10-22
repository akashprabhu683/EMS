import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { randomBytes, createHash } from "node:crypto";
import { sendAdminInvitationEmail } from "./emailService.js";

const db = admin.firestore();
const auth = admin.auth();

function getCanonicalPortalUrl(): string {
  const url = process.env.ADMIN_PORTAL_URL || process.env.FRONTEND_URL || "https://ems-admin-panel-provider.vercel.app";
  return url.replace(/\/$/, "");
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export const PRIMARY_SUPERADMIN_EMAIL = "akashprabhu0302@gmail.com";

/**
 * Helper: Ensures caller is authenticated and has admin privileges.
 */
function assertAdmin(request: any) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required to access admin operations.");
  }
  if (!request.auth.token || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Access restricted to EMS administrators.");
  }
}

/**
 * Helper: Ensures caller is the primary superadmin owner.
 */
function assertSuperadminOwner(request: any) {
  assertAdmin(request);
  const callerEmail = (request.auth?.token?.email || "").toLowerCase().trim();
  if (callerEmail !== PRIMARY_SUPERADMIN_EMAIL.toLowerCase()) {
    throw new HttpsError(
      "permission-denied",
      "Only the primary site owner (akashprabhu0302@gmail.com) has authority to manage, grant, or revoke administrator accounts."
    );
  }
}

/**
 * Callable: listAdmins
 * Returns all active administrators and pending admin invitations.
 */
export const listAdmins = onCall(async (request) => {
  assertAdmin(request);

  try {
    const [adminsSnap, invitesSnap] = await Promise.all([
      db.collection("admins").get(),
      db.collection("admin_invitations").get(),
    ]);

    const admins: any[] = [];
    adminsSnap.forEach((doc) => {
      const data = doc.data();
      admins.push({
        uid: doc.id,
        email: data.email,
        displayName: data.displayName || data.email?.split("@")[0] || "Admin",
        role: data.role || "admin",
        grantedBy: data.grantedBy || "system",
        grantedAt: data.grantedAt?.toDate?.() ? data.grantedAt.toDate().toISOString() : data.grantedAt || null,
        photoURL: data.photoURL || null,
      });
    });

    const invitations: any[] = [];
    invitesSnap.forEach((doc) => {
      const data = doc.data();
      const status = data.status || "pending";
      // Only include pending invitations in the invitations list
      if (status !== "pending") return;

      invitations.push({
        id: doc.id,
        email: data.email,
        status: "pending",
        invitedBy: data.invitedBy || "Admin",
        invitedAt: data.invitedAt?.toDate?.() ? data.invitedAt.toDate().toISOString() : data.invitedAt || null,
        expiresAt: data.expiresAt?.toDate?.() ? data.expiresAt.toDate().toISOString() : data.expiresAt || null,
        token: data.token || null,
        acceptUrl: data.acceptUrl || null,
      });
    });

    return { admins, invitations };
  } catch (err: any) {
    logger.error("listAdmins failed:", err);
    throw new HttpsError("internal", err.message || "Failed to list administrators.");
  }
});

/**
 * Callable: grantAdminRole
 * Generates an invitation token, saves it to Firestore, and dispatches an invitation email via Resend.
 * Only the site owner (akashprabhu0302@gmail.com) has authority to grant admin roles.
 */
export const grantAdminRole = onCall(async (request) => {
  assertSuperadminOwner(request);

  const emailRaw = request.data?.email;
  if (!emailRaw || typeof emailRaw !== "string") {
    throw new HttpsError("invalid-argument", "Valid email address is required.");
  }

  const email = emailRaw.trim().toLowerCase();
  const callerEmail = request.auth?.token.email || request.auth?.uid || "admin";
  const callerUid = request.auth?.uid || null;

  try {
    // Generate secure 32-byte cryptographic invitation token
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days validity
    const portalUrl = getCanonicalPortalUrl();
    const acceptUrl = `${portalUrl}/accept-invite?token=${token}&email=${encodeURIComponent(email)}`;

    // Store in admin_invitations collection with token hash and expiration metadata
    await db.collection("admin_invitations").doc(email).set({
      email,
      token, // stored for administrator copy-link convenience
      tokenHash,
      status: "pending",
      invitedBy: callerEmail,
      invitedByUid: callerUid,
      invitedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      acceptedAt: null,
      acceptedByUid: null,
      acceptUrl,
    });

    // Send invitation email via Resend
    const emailResult = await sendAdminInvitationEmail({
      toEmail: email,
      invitedBy: callerEmail,
      acceptUrl,
      expiresInDays: 7,
    });

    logger.info(`Admin invitation dispatched to ${email}. Email success: ${emailResult.success}`);

    return {
      success: true,
      status: "invited",
      emailSent: emailResult.success,
      resendId: emailResult.resendId,
      acceptUrl,
      message: `Invitation email sent to ${email}. They can accept the role using the link in their email!`,
    };
  } catch (err: any) {
    logger.error(`grantAdminRole failed for ${email}:`, err);
    throw new HttpsError("internal", err.message || "Failed to grant admin role.");
  }
});

/**
 * Callable: resendAdminInvitation
 * Resends the invitation email to a pending administrator.
 * Only the site owner (akashprabhu0302@gmail.com) has authority to resend invitations.
 */
export const resendAdminInvitation = onCall(async (request) => {
  assertSuperadminOwner(request);

  const emailRaw = request.data?.email;
  if (!emailRaw || typeof emailRaw !== "string") {
    throw new HttpsError("invalid-argument", "Valid email address is required.");
  }

  const email = emailRaw.trim().toLowerCase();
  const callerEmail = request.auth?.token.email || request.auth?.uid || "admin";

  try {
    const inviteDoc = await db.collection("admin_invitations").doc(email).get();
    if (!inviteDoc.exists) {
      throw new HttpsError("not-found", `No pending invitation found for ${email}.`);
    }

    // Refresh token, tokenHash, and expiration
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const portalUrl = getCanonicalPortalUrl();
    const acceptUrl = `${portalUrl}/accept-invite?token=${token}&email=${encodeURIComponent(email)}`;

    await inviteDoc.ref.update({
      token,
      tokenHash,
      status: "pending",
      expiresAt: Timestamp.fromDate(expiresAt),
      acceptUrl,
      lastResentAt: FieldValue.serverTimestamp(),
    });

    const emailResult = await sendAdminInvitationEmail({
      toEmail: email,
      invitedBy: callerEmail,
      acceptUrl,
      expiresInDays: 7,
    });
    logger.info(`Resent invitation email to ${email}: success=${emailResult.success}`);

    return {
      success: true,
      acceptUrl,
      message: `Invitation email resent to ${email}.`,
    };
  } catch (err: any) {
    logger.error(`resendAdminInvitation failed for ${email}:`, err);
    throw new HttpsError("internal", err.message || "Failed to resend invitation.");
  }
});

/**
 * Callable: verifyInvitationToken
 * Public verification to validate an invitation link before the user accepts.
 */
export const verifyInvitationToken = onCall(async (request) => {
  const { token, email } = request.data || {};
  if (!token) {
    return { valid: false, reason: "Invitation token is required." };
  }

  const cleanEmail = email ? String(email).trim().toLowerCase() : null;
  const tokenStr = String(token).trim();
  const tokenHash = hashToken(tokenStr);

  try {
    let inviteDoc: admin.firestore.DocumentSnapshot | null = null;

    if (cleanEmail) {
      const docSnap = await db.collection("admin_invitations").doc(cleanEmail).get();
      if (docSnap.exists) {
        inviteDoc = docSnap;
      }
    }

    // Fallback search by token or tokenHash if email doc wasn't found or email wasn't provided
    if (!inviteDoc) {
      const querySnap = await db
        .collection("admin_invitations")
        .where("tokenHash", "==", tokenHash)
        .limit(1)
        .get();

      if (!querySnap.empty) {
        inviteDoc = querySnap.docs[0];
      } else {
        const rawQuerySnap = await db
          .collection("admin_invitations")
          .where("token", "==", tokenStr)
          .limit(1)
          .get();
        if (!rawQuerySnap.empty) {
          inviteDoc = rawQuerySnap.docs[0];
        }
      }
    }

    if (!inviteDoc || !inviteDoc.exists) {
      return { valid: false, reason: "No invitation exists for this link." };
    }

    const data = inviteDoc.data() || {};
    if (data.status === "accepted") {
      return { valid: false, reason: "This invitation has already been accepted." };
    }
    if (data.status !== "pending") {
      return { valid: false, reason: "This invitation is no longer active." };
    }

    const tokenMatches = data.token === tokenStr || data.tokenHash === tokenHash;
    if (!tokenMatches) {
      return { valid: false, reason: "Invalid invitation token." };
    }

    if (data.expiresAt) {
      const expiry = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
      if (Date.now() > expiry.getTime()) {
        return { valid: false, reason: "This invitation has expired. Please request a new invitation." };
      }
    }

    return {
      valid: true,
      email: data.email,
      invitedBy: data.invitedBy || "EMS Administrator",
      status: "pending",
    };
  } catch (err: any) {
    logger.error("verifyInvitationToken error:", err);
    return { valid: false, reason: "Failed to verify invitation." };
  }
});

/**
 * Callable: acceptAdminInvitation
 * Called by the authenticated user to claim their admin role using the invitation token.
 * Uses atomic Firestore transaction to prevent concurrent or duplicate redemption.
 */
export const acceptAdminInvitation = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "You must sign in with Google to accept this invitation.");
  }

  const { token } = request.data || {};
  if (!token) {
    throw new HttpsError("invalid-argument", "Invitation token is required.");
  }

  const userEmail = request.auth.token.email.toLowerCase().trim();
  const uid = request.auth.uid;
  const userName = (request.auth.token.name as string | undefined) || userEmail.split("@")[0];
  const userPicture = (request.auth.token.picture as string | undefined) || null;
  const tokenStr = String(token).trim();
  const tokenHash = hashToken(tokenStr);

  try {
    // Execute atomic validation and acceptance in a Firestore transaction
    const inviteDocRef = db.collection("admin_invitations").doc(userEmail);
    const adminDocRef = db.collection("admins").doc(uid);

    await db.runTransaction(async (transaction) => {
      const inviteSnap = await transaction.get(inviteDocRef);
      if (!inviteSnap.exists) {
        throw new HttpsError(
          "not-found",
          `No invitation found for ${userEmail}. Please sign in with the invited email address.`
        );
      }

      const data = inviteSnap.data() || {};

      if (data.status === "accepted") {
        throw new HttpsError("already-exists", "This invitation has already been accepted.");
      }
      if (data.status !== "pending") {
        throw new HttpsError("failed-precondition", "This invitation is no longer valid.");
      }

      const tokenMatches = data.token === tokenStr || data.tokenHash === tokenHash;
      if (!tokenMatches) {
        throw new HttpsError("permission-denied", "Invitation token mismatch.");
      }

      if (data.expiresAt) {
        const expiry = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
        if (Date.now() > expiry.getTime()) {
          throw new HttpsError("deadline-exceeded", "This invitation has expired.");
        }
      }

      // Mark invitation as accepted atomically
      transaction.update(inviteDocRef, {
        status: "accepted",
        acceptedAt: FieldValue.serverTimestamp(),
        acceptedByUid: uid,
      });

      // Write admin role document
      transaction.set(adminDocRef, {
        uid,
        email: userEmail,
        displayName: userName,
        photoURL: userPicture,
        role: "admin",
        grantedBy: data.invitedBy || "invitation",
        grantedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    // Grant Firebase Auth custom claim
    const userRecord = await auth.getUser(uid);
    await auth.setCustomUserClaims(uid, {
      ...(userRecord.customClaims || {}),
      admin: true,
    });

    logger.info(`Admin invitation atomically accepted by ${userEmail} (UID: ${uid})`);
    return {
      success: true,
      message: "Admin role activated successfully! You now have full administrator access.",
    };
  } catch (err: any) {
    logger.error(`acceptAdminInvitation failed for ${userEmail}:`, err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("internal", err.message || "Failed to accept invitation.");
  }
});

/**
 * Callable: revokeAdminRole
 * Removes admin claim from a user and removes them from the admins collection.
 * Protected: Only primary superadmin (akashprabhu0302@gmail.com) can revoke roles,
 * and akashprabhu0302@gmail.com can NEVER be revoked by anyone.
 */
export const revokeAdminRole = onCall(async (request) => {
  assertSuperadminOwner(request);

  const { uid, email } = request.data || {};
  if (!uid && !email) {
    throw new HttpsError("invalid-argument", "User UID or Email is required to revoke admin role.");
  }

  // Absolute protection: akashprabhu0302@gmail.com can never be revoked under any circumstance
  if (email && email.toLowerCase() === PRIMARY_SUPERADMIN_EMAIL.toLowerCase()) {
    throw new HttpsError(
      "permission-denied",
      "The primary superadmin and site owner (akashprabhu0302@gmail.com) cannot be revoked."
    );
  }

  // Safety: Prevent self-revocation
  if (uid && uid === request.auth?.uid) {
    throw new HttpsError("invalid-argument", "You cannot revoke your own administrator account.");
  }
  if (email && email.toLowerCase() === request.auth?.token.email?.toLowerCase()) {
    throw new HttpsError("invalid-argument", "You cannot revoke your own administrator account.");
  }

  try {
    let targetUid = uid;
    let targetEmail = email;

    if (!targetUid && targetEmail) {
      try {
        const user = await auth.getUserByEmail(targetEmail.toLowerCase());
        targetUid = user.uid;
      } catch (err: any) {
        // If not in Auth, could just be a pending invitation
        await db.collection("admin_invitations").doc(targetEmail.toLowerCase()).delete().catch(() => {});
        return { success: true, message: `Removed invitation for ${targetEmail}.` };
      }
    }

    if (targetUid) {
      const user = await auth.getUser(targetUid);
      targetEmail = user.email || targetEmail;

      if (targetEmail && targetEmail.toLowerCase() === PRIMARY_SUPERADMIN_EMAIL.toLowerCase()) {
        throw new HttpsError(
          "permission-denied",
          "The primary superadmin and site owner (akashprabhu0302@gmail.com) cannot be revoked."
        );
      }

      const currentClaims = user.customClaims || {};
      const { admin: _, ...remainingClaims } = currentClaims as any;

      await auth.setCustomUserClaims(targetUid, {
        ...remainingClaims,
        admin: false,
      });

      await db.collection("admins").doc(targetUid).delete();
    }

    if (targetEmail) {
      await db.collection("admin_invitations").doc(targetEmail.toLowerCase()).delete().catch(() => {});
    }

    logger.info(`Admin role revoked for UID: ${targetUid}, Email: ${targetEmail}`);
    return {
      success: true,
      message: `Admin privileges successfully revoked for ${targetEmail || targetUid}.`,
    };
  } catch (err: any) {
    logger.error("revokeAdminRole failed:", err);
    throw new HttpsError("internal", err.message || "Failed to revoke admin role.");
  }
});

/**
 * Callable: checkAndActivatePendingAdmin
 * Note: Per security policy, invitations require explicit token redemption via acceptAdminInvitation.
 */
export const checkAndActivatePendingAdmin = onCall(async () => {
  return { activated: false };
});
