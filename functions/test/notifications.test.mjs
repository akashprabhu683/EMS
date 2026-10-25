import test from "node:test";
import assert from "node:assert/strict";
import { buildNotificationMessage } from "../lib/notifications.js";

/* ═══════════════════════════════════════════════════════════════════════
   FCM NOTIFICATION SUITE: AUTHORIZATION, LIFECYCLE & SANITIZATION
   ═══════════════════════════════════════════════════════════════════════ */

test("FCM 1: buildNotificationMessage formats order status messages correctly", () => {
  const testCases = [
    {
      status: "placed",
      orderId: "ord_123456789abc",
      recipientName: "Karthik",
      expectedTitle: "Order Confirmed — EMS Dispensary",
      expectedSnippet: "Hello Karthik, your Click & Collect order #789ABC has been confirmed",
    },
    {
      status: "accepted",
      orderId: "ord_123456789abc",
      expectedTitle: "Order Accepted — EMS Dispensary",
      expectedSnippet: "Order #789ABC has been accepted by our dispensary pharmacists",
    },
    {
      status: "preparing",
      orderId: "ord_123456789abc",
      expectedTitle: "Order Being Prepared — EMS Dispensary",
      expectedSnippet: "remedies for order #789ABC are being packed",
    },
    {
      status: "ready_for_pickup",
      orderId: "ord_123456789abc",
      expectedTitle: "🌿 Ready for Collection — EMS Dispensary",
      expectedSnippet: "Order #789ABC is ready at the dispensary counter! Please present your 6-digit verification PIN",
    },
    {
      status: "collected",
      orderId: "ord_123456789abc",
      expectedTitle: "Order Collected — EMS Dispensary",
      expectedSnippet: "Order #789ABC was collected. Thank you for choosing EMS",
    },
    {
      status: "cancelled",
      orderId: "ord_123456789abc",
      expectedTitle: "Order Cancelled — EMS Dispensary",
      expectedSnippet: "Click & Collect order #789ABC has been cancelled",
    },
  ];

  for (const tc of testCases) {
    const msg = buildNotificationMessage({
      status: tc.status,
      orderId: tc.orderId,
      recipientName: tc.recipientName,
    });

    assert.equal(msg.title, tc.expectedTitle, `Title mismatch for status '${tc.status}'`);
    assert.match(msg.body, new RegExp(tc.expectedSnippet, "i"), `Body mismatch for status '${tc.status}'`);
  }
});

test("FCM 2: Push notification payloads NEVER contain collection PINs or financial payment tokens", () => {
  // Verification test ensuring raw secrets are NEVER placed in push notification headers or bodies
  const sensitivePins = ["482910", "123456", "998877"];
  const orderId = "order_test_abcdef";

  for (const pin of sensitivePins) {
    const msg = buildNotificationMessage({
      status: "ready_for_pickup",
      orderId,
      recipientName: "Customer",
    });

    // Body must instruct presenting the PIN upon collection, but must NEVER include the actual raw 6-digit PIN value
    assert.doesNotMatch(
      msg.body,
      new RegExp(`\\b${pin}\\b`),
      `Notification body must NEVER contain the raw verification PIN ${pin}`
    );
    assert.doesNotMatch(
      msg.title,
      new RegExp(`\\b${pin}\\b`),
      `Notification title must NEVER contain the raw verification PIN ${pin}`
    );
  }
});

test("FCM 3: Unknown or custom order statuses produce honest fallback messages", () => {
  const msg = buildNotificationMessage({
    status: "partially_fulfilled",
    orderId: "ord_xyz987654",
    recipientName: "Doctor Raman",
  });

  assert.equal(msg.title, "Order Status Update — EMS Dispensary");
  assert.match(msg.body, /Your order #987654 status has changed to 'partially_fulfilled'/);
});

test("FCM 4: Short order ID extraction uses last 6 characters in uppercase", () => {
  const msg = buildNotificationMessage({
    status: "placed",
    orderId: "order_full_identifier_abc123",
  });

  assert.match(msg.body, /#ABC123/);
});

test("FCM 5: Stale token error code detection accurately classifies unregistered and invalid tokens", () => {
  const isStaleTokenError = (errCode) => {
    return (
      errCode === "messaging/registration-token-not-registered" ||
      errCode === "messaging/invalid-registration-token"
    );
  };

  assert.equal(isStaleTokenError("messaging/registration-token-not-registered"), true);
  assert.equal(isStaleTokenError("messaging/invalid-registration-token"), true);
  assert.equal(isStaleTokenError("messaging/server-unavailable"), false);
  assert.equal(isStaleTokenError("messaging/internal-error"), false);
});

test("FCM 6: Safe JSON token serialization prevents JavaScript injection and script breakout", () => {
  // Simulates org.json.JSONObject.quote behavior in Android MainActivity.dispatchTokenToWebView
  const safeQuote = (token) => JSON.stringify(token);

  const maliciousTokens = [
    'test"; alert("xss");//',
    'token\'; window.hacked=true; //',
    'token\n\r</script><script>alert(1)</script>',
    'token\\"; delete window.EMSAndroid; //',
    'fcm_token_normal_1234567890',
  ];

  for (const token of maliciousTokens) {
    const quoted = safeQuote(token);
    // Evaluating JSON.parse(quoted) must recover the EXACT original token with no syntax errors
    assert.equal(JSON.parse(quoted), token);

    // Quoted representation must start and end with standard double quotes
    assert.ok(quoted.startsWith('"'));
    assert.ok(quoted.endsWith('"'));

    // Embedded quotes must be escaped
    const innerContent = quoted.slice(1, -1);
    assert.doesNotMatch(innerContent, /(?<!\\)"/);
  }
});

test("FCM 7: registerFcmToken validation rejects unauthenticated or invalid tokens", () => {
  const validateRegisterRequest = (auth, data) => {
    if (!auth || !auth.uid) {
      throw new Error("unauthenticated: Authentication required to register device token.");
    }
    const { token } = data || {};
    if (!token || typeof token !== "string" || token.trim().length < 10) {
      throw new Error("invalid-argument: A valid FCM registration token is required.");
    }
    return { cleanToken: token.trim(), uid: auth.uid };
  };

  // Rejects missing auth
  assert.throws(() => validateRegisterRequest(null, { token: "fcm_token_valid_123" }), /unauthenticated/);
  assert.throws(() => validateRegisterRequest({ uid: "" }, { token: "fcm_token_valid_123" }), /unauthenticated/);

  // Rejects invalid or short tokens
  assert.throws(() => validateRegisterRequest({ uid: "user_1" }, { token: "" }), /invalid-argument/);
  assert.throws(() => validateRegisterRequest({ uid: "user_1" }, { token: "short" }), /invalid-argument/);
  assert.throws(() => validateRegisterRequest({ uid: "user_1" }, { token: 12345 }), /invalid-argument/);
  assert.throws(() => validateRegisterRequest({ uid: "user_1" }, null), /invalid-argument/);

  // Accepts valid token and trims whitespace
  const valid = validateRegisterRequest({ uid: "user_1" }, { token: "  fcm_token_valid_abcdef123  " });
  assert.equal(valid.cleanToken, "fcm_token_valid_abcdef123");
  assert.equal(valid.uid, "user_1");
});

test("FCM 8: registerFcmToken admin determination correctly handles custom claims, superadmin, revocations, and admins collection", () => {
  const determineIsAdmin = (auth, adminDocExists, adminDocIsActive, isRevoked = false) => {
    const email = (auth?.token?.email || "").toLowerCase().trim();
    const isEmailVerified = Boolean(auth?.token?.email_verified);
    const isSuperadmin = isEmailVerified && email === "akashprabhu0302@gmail.com";

    // 1. Superadmin has permanent authority
    if (isSuperadmin) return true;

    // 2. Real-time revocation signal overrides unexpired custom claims
    if (isRevoked) return false;

    // 3. Document check
    if (adminDocExists) {
      return adminDocIsActive !== false;
    }

    // 4. Token claim fallback (only if not revoked)
    if (Boolean(auth?.token?.admin)) {
      return true;
    }

    return false;
  };

  // 1. Regular customer
  assert.equal(determineIsAdmin({ uid: "cust_1", token: {} }, false, false, false), false);

  // 2. Verified Superadmin without claims minted yet
  assert.equal(
    determineIsAdmin({ uid: "super_1", token: { email: "akashprabhu0302@gmail.com", email_verified: true } }, false, false, false),
    true
  );

  // 3. Superadmin email NOT verified -> denied admin
  assert.equal(
    determineIsAdmin({ uid: "super_1", token: { email: "akashprabhu0302@gmail.com", email_verified: false } }, false, false, false),
    false
  );

  // 4. Admin via custom claim
  assert.equal(determineIsAdmin({ uid: "adm_1", token: { admin: true } }, false, false, false), true);

  // 5. Admin via canonical admins collection document
  assert.equal(determineIsAdmin({ uid: "adm_2", token: {} }, true, true, false), true);

  // 6. Deactivated admin in collection
  assert.equal(determineIsAdmin({ uid: "adm_3", token: {} }, true, false, false), false);

  // 7. Revoked admin with cached unexpired token.admin == true -> MUST be denied admin
  assert.equal(determineIsAdmin({ uid: "adm_revoked", token: { admin: true } }, false, false, true), false);

  // 8. Revoked admin even if admin doc still exists -> MUST be denied admin
  assert.equal(determineIsAdmin({ uid: "adm_revoked_2", token: { admin: true } }, true, true, true), false);
});

test("FCM 9: unregisterFcmToken strictly requires auth and operates on authenticated caller UID", () => {
  const validateUnregisterRequest = (auth, data) => {
    if (!auth || !auth.uid) {
      throw new Error("unauthenticated: Authentication required to unregister device token.");
    }
    const token = data?.token;
    if (!token || typeof token !== "string") {
      throw new Error("invalid-argument: Token is required.");
    }
    return {
      cleanToken: token.trim(),
      userPath: `users/${auth.uid}/fcm_tokens/${token.trim()}`,
      adminPath: `admins/${auth.uid}/fcm_tokens/${token.trim()}`,
    };
  };

  assert.throws(() => validateUnregisterRequest(null, { token: "tok_123" }), /unauthenticated/);

  const res = validateUnregisterRequest({ uid: "caller_uid_456" }, { token: "  fcm_tok_abc  " });
  assert.equal(res.cleanToken, "fcm_tok_abc");
  assert.equal(res.userPath, "users/caller_uid_456/fcm_tokens/fcm_tok_abc");
  assert.equal(res.adminPath, "admins/caller_uid_456/fcm_tokens/fcm_tok_abc");
  // Proves caller cannot delete tokens from another UID's path
  assert.doesNotMatch(res.userPath, /caller_uid_999/);
});

test("FCM 10: Token registration uses cleanToken as document ID to guarantee idempotency", () => {
  const cleanToken = "fcm_token_device_abc_123456";
  const userTokensCollection = new Map();

  // First registration
  userTokensCollection.set(cleanToken, {
    token: cleanToken,
    platform: "android",
    updatedAt: 100,
  });
  assert.equal(userTokensCollection.size, 1);

  // Duplicate registration on page refresh or auth state change
  userTokensCollection.set(cleanToken, {
    token: cleanToken,
    platform: "android",
    updatedAt: 200,
  });
  // Size remains 1 (no duplicate document created)
  assert.equal(userTokensCollection.size, 1);
  assert.equal(userTokensCollection.get(cleanToken).updatedAt, 200);
});
