import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

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
 * Grants admin claim to an existing user or creates an invitation if the user hasn't signed in yet.
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
    // 1. Check if user already exists in Firebase Auth
    let userRecord: admin.auth.UserRecord | null = null;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch (e: any) {
      if (e.code !== "auth/user-not-found") {
        throw e;
      }
    }

    if (userRecord) {
      // User exists! Attach custom claim directly
      const currentClaims = userRecord.customClaims || {};
      await auth.setCustomUserClaims(userRecord.uid, {
        ...currentClaims,
        admin: true,
      });

      // Write to admins collection
      await db.collection("admins").doc(userRecord.uid).set(
        {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName || email.split("@")[0],
          photoURL: userRecord.photoURL || null,
          role: "admin",
          grantedBy: callerEmail,
          grantedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Clean up any invitation document
      await db.collection("admin_invitations").doc(email).delete().catch(() => {});

      logger.info(`Admin role granted directly to existing user ${email} (UID: ${userRecord.uid})`);
      return {
        success: true,
        status: "active",
        message: `Admin privileges granted to ${email}. They can now sign in to the Admin Panel.`,
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
        },
      };
    } else {
      // User doesn't exist yet in Auth. Store in pending invitations
      await db.collection("admin_invitations").doc(email).set({
        email,
        status: "pending",
        invitedBy: callerEmail,
        invitedAt: FieldValue.serverTimestamp(),
      });

      logger.info(`Pending admin invitation created for ${email}`);
      return {
        success: true,
        status: "invited",
        message: `Admin invitation created for ${email}. Once they sign in with Google for the first time, their admin privileges will automatically activate!`,
      };
    }
  } catch (err: any) {
    logger.error(`grantAdminRole failed for ${email}:`, err);
    throw new HttpsError("internal", err.message || "Failed to grant admin role.");
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
 * Called when a user logs in to check if they had a pending invitation.
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
      // User has a pending invite! Auto-grant admin claim
      const userRecord = await auth.getUser(uid);
      await auth.setCustomUserClaims(uid, {
        ...(userRecord.customClaims || {}),
        admin: true,
      });

      // Save to admins collection
      await db.collection("admins").doc(uid).set({
        uid,
        email: userEmail,
        displayName: userRecord.displayName || userEmail.split("@")[0],
        photoURL: userRecord.photoURL || null,
        role: "admin",
        grantedBy: inviteDoc.data()?.invitedBy || "invitation",
        grantedAt: FieldValue.serverTimestamp(),
      });

      // Delete the pending invite
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
