# October 2026 Render / Node.js eMudhra Certificate Compromise Advisory — EMS Verification & Remediation Report

**Date of Execution**: October 28, 2026  
**Repository**: `akashprabhu683/EMS`  
**Current Branch**: `main`  
**Latest Deployed Commit**: `958044c` (`fix(security): add non-sensitive runtime check logging to backend startup for Render verification`)  
**Base Security-Remediation Commit**: `116cab1`  
**Security Advisory Reference**: [Render eMudhra Advisory](https://render.com/docs/advisory-emudhra) / [we-have-a-problem.com](https://emudhra.we-have-a-problem.com/)

---

## 1. Executive Summary & Verification Matrix

This security verification document records the authoritative remediation status for the October 19, 2026 eMudhra intermediate certificate compromise advisory across all EMS workspace components, incorporates confirmed production startup-log evidence from Render, and documents the results of controlled safe production smoke tests.

### Security Property Verification Table

| Subsystem / Item | Verification Scope | Status | Evidence & Conclusive Findings |
| :--- | :--- | :--- | :--- |
| **Render Customer Backend Runtime** | In-container Node.js & OpenSSL engine | `VERIFIED` | Production startup logs confirm: `[runtime-check] service=ems-ecommerce-backend node=v22.23.4 openssl=3.5.9`. Listening on port `10000`. |
| **Render Admin Backend Runtime** | In-container Node.js & OpenSSL engine | `VERIFIED` | Production startup logs confirm: `[runtime-check] service=ems-admin-backend node=v22.23.4 openssl=3.5.9`. Listening on port `10000`. |
| **Local Advisory Canary Probing** | Outbound TLS rejection of compromised certificates | `VERIFIED` | Test endpoints (`dv-g3b-emudhra.we-have-a-problem.com` and `dv-g3b-aaa-emudhra.we-have-a-problem.com`) were **rejected with `CERT_REVOKED`** using both `node:https` and native `fetch` under Node.js 22.23.4. Valid control endpoints (`render.com`, `firebase.google.com`) returned HTTP 200 OK. |
| **Application Outbound TLS Security** | Source-code audit of HTTP clients & CA stores | `VERIFIED` | All backends and functions use native Node.js TLS via `firebase-admin@^13.6.0`. Zero bundled third-party CA libraries (no Python `certifi`, Elixir `castore`, or Rust `webpki`). Zero instances of `rejectUnauthorized: false` or custom CA overrides. |
| **Firebase Runtime Configuration** | `functions/package.json`, `.node-version`, and CI | `VERIFIED` | `functions/package.json` set to `"engines": { "node": "22" }` (resolves to GCP runtime `nodejs22`). `functions/.node-version` pinned to `22.23.4`. GitHub Actions strictly pins `node-version: "22.23.4"`. |
| **Production Cloud Functions Dependency** | Architectural call-site analysis | `VERIFIED` | Production customer storefront and admin portal **do not depend on deployed Cloud Functions**. All primary mutations execute authoritatively via the two Render backends and direct Firestore rules. Cloud Functions are configured solely as uncalled secondary fallbacks. |
| **Firebase Cloud Functions Deployment** | Live deployment necessity | `VERIFIED` (NOT REQUIRED) | Current deployed count in `ems-store-6a342` is 0. Project is on Firebase Spark plan (Cloud Functions 2nd gen requires Blaze for Cloud Build / Artifact Registry). Upgrading to Blaze is intentionally omitted as Cloud Functions are not required by the active production architecture. |
| **Customer Backend Deployment & Health** | `ems-ecommerce-backend.onrender.com` | `PASSED` | Live `/health` endpoint responded with `200 OK` (`status: "ok"`, `service: "ecommerce-backend"`). |
| **Admin Backend Deployment & Health** | `ems-admin-backend.onrender.com` | `PASSED` | Live `/health` endpoint responded with `200 OK` (`status: "ok"`, `service: "admin-panel-backend"`). |
| **Safe Production Smoke Tests** | Public endpoints, anti-crawling, CORS & auth gates | `PASSED` | 14 / 14 non-mutating production smoke tests passed cleanly without errors. |
| **Automated Test Gate** | Full regression and security boundary test suites | `PASSED` | **151 / 151 tests passed**: Functions (105), Ecommerce backend (10), Admin backend (18), Ecommerce frontend (18), plus clean Vite production builds for both frontends. |
| **Production Order Mutation Testing** | Live checkout, cancellation, status progression, payment | `NOT TESTED` (INTENTIONAL) | Production mutations were intentionally not executed to preserve live inventory, prevent dummy orders in production database, avoid triggering customer notifications, and maintain database cleanliness. Verified via automated integration tests. |

> [!NOTE]
> Startup verification proves that both Render services run on the patched Node.js 22.23.4 runtime with OpenSSL 3.5.9. Startup verification alone does not prove that all API routes, authentication tokens, or business operations work; those are validated separately via automated tests and non-mutating smoke tests below.

---

## 2. Confirmed Production Startup Runtimes

The non-sensitive `[runtime-check]` startup logging introduced in commit `958044c` was captured in the Render live service logs:

| Service | Node.js Version | OpenSSL Version | Listening Port | Verified Status |
| :--- | :--- | :--- | :--- | :--- |
| **`ems-ecommerce-backend`** | `v22.23.4` | `3.5.9` | `10000` | Live; runtime verified |
| **`ems-admin-backend`** | `v22.23.4` | `3.5.9` | `10000` | Live; runtime verified |

Both services emitted their respective `[runtime-check]` log entries upon instance initialization and bound to port `10000` as assigned by Render.

---

## 3. Production API Contracts & Mutation Safety Analysis

Before executing live probes, an inspection of backend route definitions, authentication middleware, and database operations was performed across [Ecommerce/backend/src/routes/orders.ts](file:///c:/Users/akash/OneDrive/Desktop/EMS/Ecommerce/backend/src/routes/orders.ts) and [admin-panel/backend/src/routes/admin.ts](file:///c:/Users/akash/OneDrive/Desktop/EMS/admin-panel/backend/src/routes/admin.ts):

### 1. Customer Authentication
- **Mechanism**: `authenticateFirebaseToken` middleware validates `Authorization: Bearer <idToken>` using `adminAuth.verifyIdToken(token)`.
- **Expected Codes**: HTTP 401 Unauthorized for missing, malformed, or expired tokens.
- **Safe Test Path**: Probing protected endpoints without Bearer tokens verifies that the security boundary rejects unauthorized requests with HTTP 401 without mutating data.

### 2. Product and Category/Catalog Retrieval
- **Mechanism**: In EMS architecture, catalog browsing is handled directly by client SDKs connecting to Firestore `/categories` and `/products` collections.
- **Rules Protection**: Protected by `firebase/firestore.rules` (public read permitted only where `isActive == true`; direct client writes return HTTP 403 Forbidden).
- **Backend Admin Endpoints**: `/api/admin/products` and `/api/admin/categories` require full admin authentication.

### 3. Checkout and Order Creation
- **Endpoint**: `POST /api/orders` on `ems-ecommerce-backend`.
- **Auth**: Requires customer Firebase ID token (`Bearer <token>`).
- **Schema**: Requires `pickupContact` (`fullName`, `phone`, optional `notes`), `idempotencyKey` (8-128 alphanumeric characters), and cart items.
- **Mutation Impact**: Creates order document in `/orders`, decrements stock in `/products`, clears `/carts/{uid}`, appends an immutable record to `/audit_logs`, and triggers FCM push notifications.
- **Safety Decision**: **NOT TESTED IN PRODUCTION**. Submitting a real order would pollute production databases, decrement real inventory, and write audit logs. Verified completely via automated integration tests.

### 4. Customer Order Cancellation
- **Endpoint**: `PATCH /api/orders/:orderId/cancel` on `ems-ecommerce-backend`.
- **Auth**: Requires customer Firebase ID token; strictly enforces ownership (`req.user.uid === order.userId`) and state (`orderStatus === 'placed'`, `paymentStatus === 'unpaid'`).
- **Mutation Impact**: Updates order to `cancelled`, atomically restores product inventory, writes audit log, dispatches notifications.
- **Safety Decision**: **NOT TESTED IN PRODUCTION**. Live cancellation cannot be executed without advancing or cancelling real customer orders. Verified via automated integration tests.

### 5. Admin Order Status Transitions
- **Endpoint**: `PATCH /api/admin/orders/:orderId/status` on `ems-admin-backend`.
- **Auth**: Requires `requireAdminAuth` (checks Firebase ID token, `/admins/{uid}`, and `/admin_revocations/{uid}`).
- **Allowed Progression**: `placed` -> `accepted` -> `preparing` -> `ready_for_pickup` -> `collected` (or `cancelled`).
- **Mutation Impact**: Advances order status, assigns collection PIN verification on pickup, dispatches customer status alerts, writes audit records.
- **Safety Decision**: **NOT TESTED IN PRODUCTION**. Verified via 18 automated admin backend integration tests.

### 6. In-Person Payment Confirmation
- **Endpoint**: `PATCH /api/admin/orders/:orderId/payment` on `ems-admin-backend`.
- **Auth**: Requires `requireAdminAuth`.
- **Behavior**: Strictly limited to in-person Cash/UPI payment confirmed at the dispensary counter. Payment handling is completely decoupled from fulfillment (`orderStatus` remains unaffected). Zero online payment gateways exist in EMS.
- **Mutation Impact**: Sets `paymentStatus: 'paid'`, appends payment receipt event to order timeline, writes `PAYMENT_RECORDED` audit entry.
- **Safety Decision**: **NOT TESTED IN PRODUCTION**. Verified via automated integration tests.

---

## 4. Safe Production Smoke Tests

A non-mutating smoke test suite was executed against both production Render backends on October 28, 2026. All 14 tests completed with 100% expected results:

| Test ID | Target Service & Endpoint | Method | Expected Status | Actual Status | Result | Sanitized Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SMK-01** | `ems-ecommerce-backend` `/health` | `GET` | `200` | `200 OK` | `PASSED` | `{"status":"ok","service":"ecommerce-backend"}` |
| **SMK-02** | `ems-admin-backend` `/health` | `GET` | `200` | `200 OK` | `PASSED` | `{"status":"ok","service":"admin-panel-backend"}` |
| **SMK-03** | `ems-ecommerce-backend` `/robots.txt` | `GET` | `200` | `200 OK` | `PASSED` | `User-agent: *\nDisallow: /` |
| **SMK-04** | `ems-admin-backend` `/robots.txt` | `GET` | `200` | `200 OK` | `PASSED` | `User-agent: *\nDisallow: /` |
| **SMK-05** | `ems-ecommerce-backend` `/api/orders` | `POST` | `401` | `401 Unauthorized` | `PASSED` | `{"error":"Unauthorized: Missing or invalid Bearer token."}` |
| **SMK-06** | `ems-ecommerce-backend` `/api/orders/probe_test/cancel` | `PATCH` | `401` | `401 Unauthorized` | `PASSED` | `{"error":"Unauthorized: Missing or invalid Bearer token."}` |
| **SMK-07** | `ems-admin-backend` `/api/admin/orders` | `GET` | `401` | `401 Unauthorized` | `PASSED` | `{"error":"Unauthorized: Missing or invalid Bearer token."}` |
| **SMK-08** | `ems-admin-backend` `/api/admin/orders/probe_test/status` | `PATCH` | `401` | `401 Unauthorized` | `PASSED` | `{"error":"Unauthorized: Missing or invalid Bearer token."}` |
| **SMK-09** | `ems-admin-backend` `/api/admin/orders/probe_test/payment` | `PATCH` | `401` | `401 Unauthorized` | `PASSED` | `{"error":"Unauthorized: Missing or invalid Bearer token."}` |
| **SMK-10** | `ems-admin-backend` `/api/admin/stats` | `GET` | `401` | `401 Unauthorized` | `PASSED` | `{"error":"Unauthorized: Missing or invalid Bearer token."}` |
| **SMK-11** | `ems-admin-backend` `/api/admin/audit-logs` | `GET` | `401` | `401 Unauthorized` | `PASSED` | `{"error":"Unauthorized: Missing or invalid Bearer token."}` |
| **SMK-12** | `ems-admin-backend` `/api/admin/invitations/verify` (no token) | `GET` | `400` | `400 Bad Request` | `PASSED` | `{"valid":false,"reason":"Invitation token is required."}` |
| **SMK-13** | `ems-ecommerce-backend` `/api/orders` (CORS preflight) | `OPTIONS` | `204` | `204 No Content` | `PASSED` | Access-Control-Allow-Origin: `https://ecommerce-storefront-client.vercel.app` |
| **SMK-14** | `ems-admin-backend` `/api/admin/orders` (CORS preflight) | `OPTIONS` | `204` | `204 No Content` | `PASSED` | Access-Control-Allow-Origin: `https://ems-admin-portal.vercel.app` |

---

## 5. Render Log Review & Limitations

- **Dashboard Logs**: The maintainer confirmed that both services logged their `[runtime-check]` line and started listening on port `10000` during initialization.
- **Safe Live Requests**: All smoke test requests produced expected HTTP status codes (200, 204, 400, 401). No unhandled exceptions, 500 errors, or crashes occurred.
- **Log Access Limitation**: Antigravity does not have direct programmatic API access to the Render log stream. The maintainer can inspect the ongoing live stream anytime in the Render Dashboard under **Service** > **Logs**.

---

## 6. Fresh Automated Test & Build Pass Record

Fresh execution of all repository automated test suites confirmed zero regressions:

| Subsystem / Test Suite | Test Command Executed | Tests Passed | Tests Failed | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Cloud Functions** | `npm --prefix functions test` | **105** | 0 | `PASSED` |
| **Ecommerce Backend** | `npm --prefix Ecommerce/backend test` | **10** | 0 | `PASSED` |
| **Admin Panel Backend** | `npm --prefix admin-panel/backend test` | **18** | 0 | `PASSED` |
| **Ecommerce Storefront** | `npm --prefix Ecommerce/frontend test` | **18** | 0 | `PASSED` |
| **Ecommerce Frontend Build** | `npm --prefix Ecommerce/frontend run build` | Vite build | 0 | `PASSED` |
| **Admin Frontend Build** | `npm --prefix admin-panel/frontend run build` | Vite build | 0 | `PASSED` |
| **TOTAL** | — | **151** | **0** | **100% PASS** |

---

## 7. Separate Security Assessment Conclusions

1. **Runtime & Deployment Verification**: `VERIFIED`
   Both Render services run on Node.js `v22.23.4` with OpenSSL `3.5.9`. The eMudhra intermediate certificate compromise is remediated across all backend runtimes.
2. **Safe Production Smoke Testing**: `PASSED`
   All 14 read-only health checks, robots directives, CORS policies, and authentication boundaries are operational and correctly enforced on live endpoints.
3. **Automated Business-Logic Tests**: `PASSED`
   All 151 unit and integration tests (order transactions, PIN rate-limiting, cancellation guards, audit logging, admin authorization) passed cleanly.
4. **Production Mutation Testing**: `NOT TESTED`
   Live checkout, cancellation, order status changes, and payment recording were intentionally not performed against production databases to protect live data integrity.
5. **Overall System Security Status**: `VERIFIED` (within defined operational scope)
   The advisory vulnerability is fully addressed. No security rules or TLS verifications were weakened.
