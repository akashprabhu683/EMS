import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import admin from "firebase-admin";

const projectId = "ems-emulator-test";
const host = "127.0.0.1";
const port = 8080;

process.env.FIRESTORE_EMULATOR_HOST = `${host}:${port}`;

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}
const adminDb = admin.firestore();

/* ═══════════════════════════════════════════════════════════════════════
   JWT & REST HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

function createToken(payload) {
  if (!payload) return null;
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    user_id: payload.uid,
    sub: payload.uid,
    auth_time: Math.floor(Date.now() / 1000),
    ...payload,
  })).toString("base64url");
  return `${header}.${claims}.`;
}

// Actor tokens
const tokenCustomerBob = createToken({ uid: "customer_bob", email: "bob@gmail.com", admin: false });
const tokenCustomerCharlie = createToken({ uid: "customer_charlie", email: "charlie@gmail.com", admin: false });
const tokenActiveAdmin = createToken({ uid: "admin_alice", email: "alice@ems.shop", admin: true });
const tokenSuperadmin = createToken({ uid: "superadmin_akash", email: "akashprabhu0302@gmail.com", admin: true });

async function firestoreRequest({ path, method = "GET", token, body }) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "";
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const req = http.request({
      hostname: host,
      port,
      path: `/v1/projects/${projectId}/databases/(default)/documents${path}`,
      method,
      headers,
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : {} });
        } catch {
          resolve({ status: res.statusCode, raw });
        }
      });
    });

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   DATABASE SEEDING VIA ADMIN SDK (BYPASSES RULES)
   ═══════════════════════════════════════════════════════════════════════ */

async function seedEmulatorDb() {
  // 1. Categories: Active and Inactive
  await adminDb.collection("categories").doc("cat_active").set({
    name: "Ayurvedic Supplements",
    slug: "ayurvedic-supplements",
    isActive: true,
  });
  await adminDb.collection("categories").doc("cat_inactive").set({
    name: "Discontinued Herbal Teas",
    slug: "discontinued-herbal-teas",
    isActive: false,
  });

  // 2. Products: Active and Inactive
  await adminDb.collection("products").doc("prod_active").set({
    name: "Organic Ashwagandha",
    categoryId: "cat_active",
    price: 34900,
    stock: 25,
    isActive: true,
  });
  await adminDb.collection("products").doc("prod_inactive").set({
    name: "Archived Herb Extract",
    categoryId: "cat_inactive",
    price: 19900,
    stock: 0,
    isActive: false,
  });

  // 3. Orders: Bob's order and Charlie's order
  await adminDb.collection("orders").doc("order_bob_101").set({
    userId: "customer_bob",
    orderStatus: "placed",
    total: 34900,
    items: [{ productId: "prod_active", quantity: 1 }],
  });
  await adminDb.collection("orders").doc("order_charlie_202").set({
    userId: "customer_charlie",
    orderStatus: "placed",
    total: 69800,
    items: [{ productId: "prod_active", quantity: 2 }],
  });

  // 4. Users and Carts
  await adminDb.collection("users").doc("customer_bob").set({
    displayName: "Bob Customer",
    email: "bob@gmail.com",
  });
  await adminDb.collection("carts").doc("customer_bob").set({
    items: [{ productId: "prod_active", quantity: 1 }],
  });

  // 5. Admins and Revocations
  await adminDb.collection("admins").doc("admin_alice").set({
    uid: "admin_alice",
    email: "alice@ems.shop",
    isActive: true,
  });
  await adminDb.collection("admins").doc("admin_deactivated").set({
    uid: "admin_deactivated",
    email: "deactivated@ems.shop",
    isActive: false,
  });
  await adminDb.collection("admin_revocations").doc("admin_revoked").set({
    revokedAt: new Date().toISOString(),
    revokedBy: "akashprabhu0302@gmail.com",
  });
  await adminDb.collection("admin_invitations").doc("invited@ems.shop").set({
    email: "invited@ems.shop",
    tokenHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    status: "pending",
  });

  // 6. Audit logs and Operational reports
  await adminDb.collection("audit_logs").doc("audit_log_1").set({
    action: "ORDER_CREATED",
    actor: { uid: "system" },
    timestamp: new Date().toISOString(),
  });
  await adminDb.collection("operational_reports").doc("report_2026_10").set({
    date: "2026-10-24",
    totalRevenue: 104700,
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   EMULATOR SECURITY RULES TEST SUITE
   ═══════════════════════════════════════════════════════════════════════ */

test("Emulator Gate: Setup and Initial Seed", async () => {
  await seedEmulatorDb();
  const prodDoc = await adminDb.collection("products").doc("prod_active").get();
  assert.equal(prodDoc.exists, true);
  assert.equal(prodDoc.data().name, "Organic Ashwagandha");
});

test("Emulator Gate 1: Public Catalog Reads - Anonymous and customers see active items only", async () => {
  // Active product is readable by anonymous public
  const resAnonActiveProd = await firestoreRequest({ path: "/products/prod_active" });
  assert.equal(resAnonActiveProd.status, 200, "Active product must be publicly readable");

  // Inactive product is rejected (403) for anonymous public
  const resAnonInactiveProd = await firestoreRequest({ path: "/products/prod_inactive" });
  assert.equal(resAnonInactiveProd.status, 403, "Inactive product must NOT be readable by public");

  // Active category is readable by customer
  const resCustActiveCat = await firestoreRequest({ path: "/categories/cat_active", token: tokenCustomerBob });
  assert.equal(resCustActiveCat.status, 200, "Active category must be readable by customer");

  // Inactive category is rejected (403) for customer
  const resCustInactiveCat = await firestoreRequest({ path: "/categories/cat_inactive", token: tokenCustomerBob });
  assert.equal(resCustInactiveCat.status, 403, "Inactive category must NOT be readable by customer");

  // Active Admin can read both active AND inactive items
  const resAdminInactiveProd = await firestoreRequest({ path: "/products/prod_inactive", token: tokenActiveAdmin });
  assert.equal(resAdminInactiveProd.status, 200, "Admin must be able to read inactive products for catalog management");

  const resAdminInactiveCat = await firestoreRequest({ path: "/categories/cat_inactive", token: tokenActiveAdmin });
  assert.equal(resAdminInactiveCat.status, 200, "Admin must be able to read inactive categories for catalog management");
});

test("Emulator Gate 2: Direct Client Catalog Mutations are Strictly Denied (create, update, delete: if false)", async () => {
  // 1. Anonymous product creation denied
  const resAnonProdCreate = await firestoreRequest({
    path: "/products/hacked_product",
    method: "PATCH",
    body: { fields: { name: { stringValue: "Hacked Item" }, price: { integerValue: 100 } } },
  });
  assert.equal(resAnonProdCreate.status, 403, "Direct product creation by anonymous must be 403");

  // 2. Customer product creation denied
  const resCustProdCreate = await firestoreRequest({
    path: "/products/customer_product",
    method: "PATCH",
    token: tokenCustomerBob,
    body: { fields: { name: { stringValue: "Customer Item" } } },
  });
  assert.equal(resCustProdCreate.status, 403, "Direct product creation by customer must be 403");

  // 3. Admin direct product creation denied (must route through Cloud Function / Express backend)
  const resAdminProdCreate = await firestoreRequest({
    path: "/products/admin_direct_product",
    method: "PATCH",
    token: tokenActiveAdmin,
    body: { fields: { name: { stringValue: "Admin Direct Item" } } },
  });
  assert.equal(resAdminProdCreate.status, 403, "Direct product creation by admin must be 403");

  // 4. Admin direct product price update denied (must route through backend)
  const resAdminProdUpdate = await firestoreRequest({
    path: "/products/prod_active",
    method: "PATCH",
    token: tokenActiveAdmin,
    body: { fields: { price: { integerValue: 99999 } } },
  });
  assert.equal(resAdminProdUpdate.status, 403, "Direct product update by admin must be 403");

  // 5. Admin direct product deletion denied
  const resAdminProdDelete = await firestoreRequest({
    path: "/products/prod_active",
    method: "DELETE",
    token: tokenActiveAdmin,
  });
  assert.equal(resAdminProdDelete.status, 403, "Direct product deletion by admin must be 403");

  // 6. Direct category creation, update, and deletion denied for all
  const resCustCatCreate = await firestoreRequest({
    path: "/categories/rogue_cat",
    method: "PATCH",
    token: tokenCustomerBob,
    body: { fields: { name: { stringValue: "Rogue Category" } } },
  });
  assert.equal(resCustCatCreate.status, 403, "Direct category creation by customer must be 403");

  const resAdminCatUpdate = await firestoreRequest({
    path: "/categories/cat_active",
    method: "PATCH",
    token: tokenActiveAdmin,
    body: { fields: { name: { stringValue: "Renamed Active" } } },
  });
  assert.equal(resAdminCatUpdate.status, 403, "Direct category update by admin must be 403");

  const resAdminCatDelete = await firestoreRequest({
    path: "/categories/cat_active",
    method: "DELETE",
    token: tokenActiveAdmin,
  });
  assert.equal(resAdminCatDelete.status, 403, "Direct category deletion by admin must be 403");
});

test("Emulator Gate 3: Order Security - Direct writes denied, owner isolation enforced", async () => {
  // 1. Anonymous cannot read orders
  const resAnonOrder = await firestoreRequest({ path: "/orders/order_bob_101" });
  assert.equal(resAnonOrder.status, 403, "Anonymous read of order must be 403");

  // 2. Customer Bob can read his own order
  const resBobOrder = await firestoreRequest({ path: "/orders/order_bob_101", token: tokenCustomerBob });
  assert.equal(resBobOrder.status, 200, "Customer Bob must be able to read his own order");

  // 3. Customer Bob cannot read Charlie's order
  const resBobReadCharlie = await firestoreRequest({ path: "/orders/order_charlie_202", token: tokenCustomerBob });
  assert.equal(resBobReadCharlie.status, 403, "Customer Bob must NOT be able to read Charlie's order");

  // 4. Admin can read any customer order
  const resAdminReadBob = await firestoreRequest({ path: "/orders/order_bob_101", token: tokenActiveAdmin });
  assert.equal(resAdminReadBob.status, 200, "Admin must be able to read Bob's order");

  const resAdminReadCharlie = await firestoreRequest({ path: "/orders/order_charlie_202", token: tokenActiveAdmin });
  assert.equal(resAdminReadCharlie.status, 200, "Admin must be able to read Charlie's order");

  // 5. Direct client order creation denied for customers (Phase 6A requirement)
  const resCustOrderCreate = await firestoreRequest({
    path: "/orders/direct_order_999",
    method: "PATCH",
    token: tokenCustomerBob,
    body: { fields: { userId: { stringValue: "customer_bob" }, total: { integerValue: 5000 } } },
  });
  assert.equal(resCustOrderCreate.status, 403, "Direct client order creation must be 403");

  // 6. Direct client order status mutation denied (e.g. bypassing pickup PIN or mark collected)
  const resCustOrderUpdate = await firestoreRequest({
    path: "/orders/order_bob_101",
    method: "PATCH",
    token: tokenCustomerBob,
    body: { fields: { orderStatus: { stringValue: "collected" } } },
  });
  assert.equal(resCustOrderUpdate.status, 403, "Direct client order status update must be 403");

  // 7. Direct client order deletion denied
  const resCustOrderDelete = await firestoreRequest({
    path: "/orders/order_bob_101",
    method: "DELETE",
    token: tokenCustomerBob,
  });
  assert.equal(resCustOrderDelete.status, 403, "Direct client order deletion must be 403");
});

test("Emulator Gate 4: Audit Logs & Operational Reports - Admin-only read, 100% write-protected", async () => {
  // 1. Anonymous cannot read audit logs
  const resAnonAudit = await firestoreRequest({ path: "/audit_logs/audit_log_1" });
  assert.equal(resAnonAudit.status, 403, "Anonymous read of audit logs must be 403");

  // 2. Customer cannot read audit logs
  const resCustAudit = await firestoreRequest({ path: "/audit_logs/audit_log_1", token: tokenCustomerBob });
  assert.equal(resCustAudit.status, 403, "Customer read of audit logs must be 403");

  // 3. Admin can read audit logs
  const resAdminAudit = await firestoreRequest({ path: "/audit_logs/audit_log_1", token: tokenActiveAdmin });
  assert.equal(resAdminAudit.status, 200, "Admin must be able to read audit logs");

  // 4. Clients CANNOT write or alter audit logs directly (even admins)
  const resAdminWriteAudit = await firestoreRequest({
    path: "/audit_logs/fake_log",
    method: "PATCH",
    token: tokenActiveAdmin,
    body: { fields: { action: { stringValue: "FRAUDULENT_ACTION" } } },
  });
  assert.equal(resAdminWriteAudit.status, 403, "Direct client writing of audit logs must be 403");

  // 5. Operational reports: Customer denied read, Admin allowed read, writes strictly denied
  const resCustReport = await firestoreRequest({ path: "/operational_reports/report_2026_10", token: tokenCustomerBob });
  assert.equal(resCustReport.status, 403, "Customer read of operational report must be 403");

  const resAdminReport = await firestoreRequest({ path: "/operational_reports/report_2026_10", token: tokenActiveAdmin });
  assert.equal(resAdminReport.status, 200, "Admin read of operational report must be 200");

  const resAdminWriteReport = await firestoreRequest({
    path: "/operational_reports/report_2026_10",
    method: "PATCH",
    token: tokenActiveAdmin,
    body: { fields: { totalRevenue: { integerValue: 0 } } },
  });
  assert.equal(resAdminWriteReport.status, 403, "Direct client modification of operational reports must be 403");
});

test("Emulator Gate 5: User & Cart Document Isolation", async () => {
  // 1. Bob can read and write his own user profile
  const resBobUser = await firestoreRequest({ path: "/users/customer_bob", token: tokenCustomerBob });
  assert.equal(resBobUser.status, 200, "Bob can read his own user profile");

  const resBobUpdateUser = await firestoreRequest({
    path: "/users/customer_bob",
    method: "PATCH",
    token: tokenCustomerBob,
    body: { fields: { phone: { stringValue: "9876543210" } } },
  });
  assert.equal(resBobUpdateUser.status, 200, "Bob can update his own user profile");

  // 2. Bob CANNOT read or write Charlie's user profile
  const resBobCharlieUser = await firestoreRequest({ path: "/users/customer_charlie", token: tokenCustomerBob });
  assert.equal(resBobCharlieUser.status, 403, "Bob cannot read Charlie's user profile");

  // 3. Bob can read and update his own cart
  const resBobCart = await firestoreRequest({ path: "/carts/customer_bob", token: tokenCustomerBob });
  assert.equal(resBobCart.status, 200, "Bob can read his own cart");

  // 4. Bob CANNOT read or modify Charlie's cart
  const resBobCharlieCart = await firestoreRequest({ path: "/carts/customer_charlie", token: tokenCustomerBob });
  assert.equal(resBobCharlieCart.status, 403, "Bob cannot read Charlie's cart");

  // 5. FCM Device Token Isolation: Bob can register his own token
  const resBobTokenCreate = await firestoreRequest({
    path: "/users/customer_bob/fcm_tokens/token_bob_123456",
    method: "PATCH",
    token: tokenCustomerBob,
    body: { fields: { token: { stringValue: "token_bob_123456" }, platform: { stringValue: "android" } } },
  });
  assert.equal(resBobTokenCreate.status, 200, "Bob can register his own FCM device token");

  // 6. FCM Device Token Isolation: Bob CANNOT register or alter Charlie's token
  const resBobCharlieToken = await firestoreRequest({
    path: "/users/customer_charlie/fcm_tokens/token_charlie_123456",
    method: "PATCH",
    token: tokenCustomerBob,
    body: { fields: { token: { stringValue: "token_charlie_123456" }, platform: { stringValue: "android" } } },
  });
  assert.equal(resBobCharlieToken.status, 403, "Bob CANNOT register or alter Charlie's FCM token");

  // 7. FCM Device Token Isolation: Bob CANNOT read Charlie's tokens
  const resBobCharlieTokenRead = await firestoreRequest({
    path: "/users/customer_charlie/fcm_tokens/token_charlie_123456",
    token: tokenCustomerBob,
  });
  assert.equal(resBobCharlieTokenRead.status, 403, "Bob CANNOT read Charlie's FCM tokens");

  // 8. FCM Device Token Isolation: Bob CANNOT delete Charlie's tokens
  const resBobCharlieTokenDelete = await firestoreRequest({
    path: "/users/customer_charlie/fcm_tokens/token_charlie_123456",
    method: "DELETE",
    token: tokenCustomerBob,
  });
  assert.equal(resBobCharlieTokenDelete.status, 403, "Bob CANNOT delete Charlie's FCM tokens");

  // 9. Admin token access: Customer CANNOT register or read in /admins/{uid}/fcm_tokens
  const resBobAdminToken = await firestoreRequest({
    path: "/admins/admin_alice/fcm_tokens/token_alice_123",
    method: "PATCH",
    token: tokenCustomerBob,
    body: { fields: { token: { stringValue: "token_alice_123" } } },
  });
  assert.equal(resBobAdminToken.status, 403, "Customer CANNOT write to another admin's FCM tokens");

  // 9b. Tightened rule enforcement: Customer Bob CANNOT write to /admins/customer_bob/fcm_tokens even with matching UID
  const resBobSelfAdminToken = await firestoreRequest({
    path: "/admins/customer_bob/fcm_tokens/token_bob_123",
    method: "PATCH",
    token: tokenCustomerBob,
    body: { fields: { token: { stringValue: "token_bob_123" } } },
  });
  assert.equal(resBobSelfAdminToken.status, 403, "Non-admin Bob CANNOT create or write to /admins/customer_bob/fcm_tokens");

  // 9c. Revoked admin CANNOT write to /admins/admin_revoked/fcm_tokens
  const tokenRevokedAdmin = createToken({ uid: "admin_revoked", email: "revoked@ems.shop", admin: true });
  const resRevokedAdminToken = await firestoreRequest({
    path: "/admins/admin_revoked/fcm_tokens/token_revoked_123",
    method: "PATCH",
    token: tokenRevokedAdmin,
    body: { fields: { token: { stringValue: "token_revoked_123" } } },
  });
  assert.equal(resRevokedAdminToken.status, 403, "Revoked admin CANNOT write to admin FCM tokens");

  // 10. Active Admin Alice can register her own admin device token
  const resAliceAdminToken = await firestoreRequest({
    path: "/admins/admin_alice/fcm_tokens/token_alice_123",
    method: "PATCH",
    token: tokenActiveAdmin,
    body: { fields: { token: { stringValue: "token_alice_123" }, platform: { stringValue: "android" } } },
  });
  assert.equal(resAliceAdminToken.status, 200, "Active Admin Alice can register her admin FCM token");
});

test("Emulator Gate 6: Superadmin & Real-Time Revocation Visibility", async () => {
  // 1. Superadmin can read all catalog items and orders
  const resSuperadminOrder = await firestoreRequest({ path: "/orders/order_bob_101", token: tokenSuperadmin });
  assert.equal(resSuperadminOrder.status, 200, "Superadmin can read orders");

  const resSuperadminAudit = await firestoreRequest({ path: "/audit_logs/audit_log_1", token: tokenSuperadmin });
  assert.equal(resSuperadminAudit.status, 200, "Superadmin can read audit logs");

  // 2. Revoked admin can read their own revocation record (real-time broadcast signal)
  const tokenRevokedAdmin = createToken({ uid: "admin_revoked", email: "revoked@ems.shop", admin: true });
  const resRevocationSelf = await firestoreRequest({ path: "/admin_revocations/admin_revoked", token: tokenRevokedAdmin });
  assert.equal(resRevocationSelf.status, 200, "Revoked admin must be able to read their own revocation record");

  // 3. Revoked admin CANNOT read another admin's revocation record
  const resRevocationOther = await firestoreRequest({ path: "/admin_revocations/admin_alice", token: tokenRevokedAdmin });
  assert.equal(resRevocationOther.status, 403, "User cannot read another user's revocation record");
});

test("Emulator Gate 7: Revoked Admin Immediate Denial & Superadmin Invitation Protections", async () => {
  const tokenRevokedAdmin = createToken({ uid: "admin_revoked", email: "revoked@ems.shop", admin: true });

  // 1. Revoked admin has token.admin == true, but must be immediately rejected on admin reads
  const resRevokedAudit = await firestoreRequest({ path: "/audit_logs/audit_log_1", token: tokenRevokedAdmin });
  assert.equal(resRevokedAudit.status, 403, "Revoked admin must be immediately denied access to audit logs");

  const resRevokedReports = await firestoreRequest({ path: "/operational_reports/report_2026_10", token: tokenRevokedAdmin });
  assert.equal(resRevokedReports.status, 403, "Revoked admin must be immediately denied access to operational reports");

  const resRevokedOrders = await firestoreRequest({ path: "/orders/order_bob_101", token: tokenRevokedAdmin });
  assert.equal(resRevokedOrders.status, 403, "Revoked admin must be immediately denied reading other users' orders");

  const resRevokedInvites = await firestoreRequest({ path: "/admin_invitations/invited@ems.shop", token: tokenRevokedAdmin });
  assert.equal(resRevokedInvites.status, 403, "Revoked admin must be immediately denied reading admin invitations");

  // 2. Active admin can read invitations, but cannot write invitations
  const resActiveAdminInviteRead = await firestoreRequest({ path: "/admin_invitations/invited@ems.shop", token: tokenActiveAdmin });
  assert.equal(resActiveAdminInviteRead.status, 200, "Active admin can read invitations list");

  const resActiveAdminInviteWrite = await firestoreRequest({
    path: "/admin_invitations/new_admin@ems.shop",
    method: "PATCH",
    token: tokenActiveAdmin,
    body: { fields: { email: { stringValue: "new_admin@ems.shop" } } },
  });
  assert.equal(resActiveAdminInviteWrite.status, 403, "Regular active admin cannot write admin invitations");

  // 3. Superadmin has write authority on admin invitations
  const resSuperadminInviteWrite = await firestoreRequest({
    path: "/admin_invitations/new_admin@ems.shop",
    method: "PATCH",
    token: tokenSuperadmin,
    body: { fields: { email: { stringValue: "new_admin@ems.shop" } } },
  });
  assert.equal(resSuperadminInviteWrite.status, 200, "Superadmin can write admin invitations");
});
