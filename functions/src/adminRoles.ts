import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { randomBytes } from "node:crypto";
import { sendAdminInvitationEmail } from "./emailService.js";

const db = admin.firestore();
const auth = admin.auth();

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
      invitations.push({
        id: doc.id,
        email: data.email,
        status: data.status || "pending",
        invitedBy: data.invitedBy || "Admin",
        invitedAt: data.invitedAt?.toDate?.() ? data.invitedAt.toDate().toISOString() : data.invitedAt || null,
        expiresAt: data.expiresAt?.toDate?.() ? data.expiresAt.toDate().toISOString() : data.expiresAt || null,
        token: data.token || null,
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
 */
export const grantAdminRole = onCall(async (request) => {
  assertAdmin(request);

  const emailRaw = request.data?.email;
  if (!emailRaw || typeof emailRaw !== "string") {
    throw new HttpsError("invalid-argument", "Valid email address is required.");
  }

  const email = emailRaw.trim().toLowerCase();
  const callerEmail = request.auth?.token.email || request.auth?.uid || "admin";

  try {
    // Generate secure 32-byte cryptographic invitation token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days validity
    const portalUrl = process.env.ADMIN_PORTAL_URL || "https://ems-admin-portal.vercel.app";
    const acceptUrl = `${portalUrl}/accept-invite?token=${token}&email=${encodeURIComponent(email)}`;

    // Store in admin_invitations collection
    await db.collection("admin_invitations").doc(email).set({
      email,
      token,
      status: "pending",
      invitedBy: callerEmail,
      invitedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
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
 */
export const resendAdminInvitation = onCall(async (request) => {
  assertAdmin(request);

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

    // Refresh token and expiration
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const portalUrl = process.env.ADMIN_PORTAL_URL || "https://ems-admin-portal.vercel.app";
    const acceptUrl = `${portalUrl}/accept-invite?token=${token}&email=${encodeURIComponent(email)}`;

    await inviteDoc.ref.update({
      token,
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
  if (!token || !email) {
    return { valid: false, reason: "Invitation token and email are required." };
  }

  const cleanEmail = String(email).trim().toLowerCase();

  try {
    const inviteDoc = await db.collection("admin_invitations").doc(cleanEmail).get();
    if (!inviteDoc.exists) {
      return { valid: false, reason: "No invitation exists for this email address." };
    }

    const data = inviteDoc.data() || {};
    if (data.status !== "pending") {
      return { valid: false, reason: "This invitation has already been accepted or deactivated." };
    }

    if (data.token !== token) {
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
      email: cleanEmail,
      invitedBy: data.invitedBy || "EMS Administrator",
    };
  } catch (err: any) {
    logger.error("verifyInvitationToken error:", err);
    return { valid: false, reason: "Failed to verify invitation." };
  }
});

/**
 * Callable: acceptAdminInvitation
 * Called by the authenticated user to claim their admin role using the invitation token.
 */
export const acceptAdminInvitation = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "You must sign in with Google to accept this invitation.");
  }

  const { token } = request.data || {};
  if (!token) {
    throw new HttpsError("invalid-argument", "Invitation token is required.");
  }

  const userEmail = request.auth.token.email.toLowerCase();
  const uid = request.auth.uid;

  try {
    const inviteDoc = await db.collection("admin_invitations").doc(userEmail).get();
    if (!inviteDoc.exists) {
      throw new HttpsError("not-found", "No invitation was found for your signed-in email address.");
    }

    const data = inviteDoc.data() || {};
    if (data.token !== token) {
      throw new HttpsError("permission-denied", "Invitation token mismatch.");
    }

    if (data.expiresAt) {
      const expiry = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
      if (Date.now() > expiry.getTime()) {
        throw new HttpsError("deadline-exceeded", "This invitation token has expired.");
      }
    }

    // 1. Grant custom claims in Firebase Auth
    const userRecord = await auth.getUser(uid);
    await auth.setCustomUserClaims(uid, {
      ...(userRecord.customClaims || {}),
      admin: true,
    });

    // 2. Create active record in admins collection
    await db.collection("admins").doc(uid).set({
      uid,
      email: userEmail,
      displayName: userRecord.displayName || userEmail.split("@")[0],
      photoURL: userRecord.photoURL || null,
      role: "admin",
      grantedBy: data.invitedBy || "invitation",
      grantedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 3. Remove pending invitation document
    await inviteDoc.ref.delete();

    logger.info(`Admin invitation accepted by ${userEmail} (UID: ${uid})`);
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
 */
export const revokeAdminRole = onCall(async (request) => {
  assertAdmin(request);

  const { uid, email } = request.data || {};
  if (!uid && !email) {
    throw new HttpsError("invalid-argument", "User UID or Email is required to revoke admin role.");
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
 * Backwards-compatibility fallback when an invited admin logs in directly at /login.
 */
export const checkAndActivatePendingAdmin = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email) {
    return { activated: false };
  }

  const userEmail = request.auth.token.email.toLowerCase();
  const uid = request.auth.uid;

  try {
    const inviteDoc = await db.collection("admin_invitations").doc(userEmail).get();
    if (inviteDoc.exists) {
      const userRecord = await auth.getUser(uid);
      await auth.setCustomUserClaims(uid, {
        ...(userRecord.customClaims || {}),
        admin: true,
      });

      await db.collection("admins").doc(uid).set({
        uid,
        email: userEmail,
        displayName: userRecord.displayName || userEmail.split("@")[0],
        photoURL: userRecord.photoURL || null,
        role: "admin",
        grantedBy: inviteDoc.data()?.invitedBy || "invitation",
        grantedAt: FieldValue.serverTimestamp(),
      });

      await inviteDoc.ref.delete();
      logger.info(`Auto-activated pending admin role for ${userEmail} (UID: ${uid})`);
      return { activated: true };
    }

    return { activated: false };
  } catch (err) {
    logger.error("checkAndActivatePendingAdmin error:", err);
    return { activated: false };
  }
});
