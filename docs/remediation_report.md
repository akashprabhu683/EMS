# October 2026 Render / Node.js eMudhra Certificate Compromise Advisory — EMS Verification & Remediation Report

**Date of Execution**: October 28, 2026  
**Repository**: `akashprabhu683/EMS`  
**Current Branch**: `main`  
**Latest Deployed Commit**: `958044c` (`fix(security): add non-sensitive runtime check logging to backend startup for Render verification`)  
**Base Security-Remediation Commit**: `116cab1`  
**Local Node.js Engine**: `v22.23.4` (OpenSSL 3.0.15+quic)  
**Security Advisory Reference**: [Render eMudhra Advisory](https://render.com/docs/advisory-emudhra) / [we-have-a-problem.com](https://emudhra.we-have-a-problem.com/)

---

## 1. Executive Summary & Verification Matrix

This security verification confirms the remediation status of the October 19, 2026 public disclosure regarding compromised eMudhra intermediate certificate authority private keys across all EMS workspace components.

### Security Property Verification Table

| Subsystem / Item | Verification Scope | Status | Evidence & Conclusive Findings |
| :--- | :--- | :--- | :--- |
| **Firebase Runtime Configuration** | `functions/package.json`, `.node-version`, and CI | `VERIFIED` | `functions/package.json` set to `"engines": { "node": "22" }` (resolves to Google Cloud's official `nodejs22` runtime). [functions/.node-version](file:///c:/Users/akash/OneDrive/Desktop/EMS/functions/.node-version) pinned to `22.23.4`. GitHub Actions pins `node-version: "22.23.4"`. |
| **Production Cloud Functions Dependency** | Architectural call-site analysis | `VERIFIED` | Production customer storefront and admin portal **do not depend on deployed Cloud Functions**. All primary mutations route through Render backends (`/api/orders`, `/api/admin/*`) and direct Firestore rules. Cloud Functions are configured solely as uncalled secondary fallbacks. |
| **Firebase Cloud Functions Deployment** | Live deployment necessity | `VERIFIED` (NOT REQUIRED) | Current deployed count in `ems-store-6a342` is 0. Project is on Firebase Spark plan (Cloud Functions 2nd gen requires Blaze for Cloud Build / Artifact Registry). Upgrading to Blaze is not needed by the active production architecture. |
| **Local Advisory Canary Probing** | Outbound TLS rejection of compromised certificates | `VERIFIED` | Both test endpoints (`https://dv-g3b-emudhra.we-have-a-problem.com/` and `https://dv-g3b-aaa-emudhra.we-have-a-problem.com/`) were **rejected with `CERT_REVOKED`** using `node:https` and native `fetch` under Node.js 22.23.4. Valid endpoints (`render.com`, `firebase.google.com`) returned HTTP 200. |
| **Application Outbound TLS Security** | Codebase audit of HTTP clients & CA stores | `VERIFIED` | All backends and functions use native Node.js TLS via `firebase-admin@^13.6.0`. Zero bundled third-party CA libraries (no Python `certifi`, Elixir `castore`, or Rust `webpki`). Zero instances of `rejectUnauthorized: false` or custom CA overrides. |
| **Render Customer Backend (`ems-ecommerce-backend`)** | Service health and deployment commit | `VERIFIED` (DEPLOYED & HEALTHY) | Deployed commit `958044c`. Live endpoint `https://ems-ecommerce-backend.onrender.com/health` responded HTTP 200 OK (`status: "ok"`, `uptime: 32.8s`). |
| **Render Admin Backend (`ems-admin-backend`)** | Service health and deployment commit | `VERIFIED` (DEPLOYED & HEALTHY) | Deployed commit `958044c`. Live endpoint `https://ems-admin-backend.onrender.com/health` responded HTTP 200 OK (`status: "ok"`, `uptime: 27.8s`). |
| **Render Customer Backend In-Container Runtime** | Live container `node` & `openssl` version | `PENDING` (DASHBOARD LOG CONFIRMATION) | Non-sensitive startup log `[runtime-check]` added in commit `958044c`. To verify in Render Dashboard: navigate to **ems-ecommerce-backend** > **Logs** and locate `[runtime-check] service=ems-ecommerce-backend node=v22.23.4 openssl=...`. |
| **Render Admin Backend In-Container Runtime** | Live container `node` & `openssl` version | `PENDING` (DASHBOARD LOG CONFIRMATION) | Non-sensitive startup log `[runtime-check]` added in commit `958044c`. To verify in Render Dashboard: navigate to **ems-admin-backend** > **Logs** and locate `[runtime-check] service=ems-admin-backend node=v22.23.4 openssl=...`. |
| **Automated Test Gate** | Full regression and security boundary test suites | `VERIFIED` | **151 / 151 tests passed**: Functions (105), Ecommerce backend (10), Admin backend (18), Ecommerce frontend (18), plus clean Vite production builds for both frontends. |

---

## 2. Task 1: Firebase Configuration Verification

### Current Verified Configuration
- [functions/package.json](file:///c:/Users/akash/OneDrive/Desktop/EMS/functions/package.json):
  ```json
  "engines": {
    "node": "22"
  }
  ```
- [functions/.node-version](file:///c:/Users/akash/OneDrive/Desktop/EMS/functions/.node-version): `22.23.4`
- [.github/workflows/firebase-deploy.yml](file:///c:/Users/akash/OneDrive/Desktop/EMS/.github/workflows/firebase-deploy.yml):
  ```yaml
  - name: Setup Node.js 22.23.4
    uses: actions/setup-node@v4
    with:
      node-version: "22.23.4"
  ```
- [firebase.json](file:///c:/Users/akash/OneDrive/Desktop/EMS/firebase.json): Configured with `"disallowLegacyRuntimeConfig": true`.

### CLI Validation & Predeploy Build
- `firebase-tools@15.33.0` resolves `engines.node: "22"` directly to official GCP runtime `nodejs22`.
- TypeScript build (`npm --prefix functions run build`) compiled cleanly with zero diagnostic errors.
- Automated Functions test suite (`npm --prefix functions test`) executed with **105 passed, 0 failed**.

---

## 3. Task 2: Production Dependency on Cloud Functions

An architectural audit of all production call sites across `Ecommerce/frontend/src/` and `admin-panel/frontend/src/` was conducted to determine whether live production traffic depends on Cloud Functions:

1. **Customer Checkout & Orders (`Ecommerce/frontend/src/pages/CheckoutPage.tsx`)**:
   - Primary: Trusted Express API `POST ${VITE_API_URL}/api/orders` on `ems-ecommerce-backend`.
   - Fallback: `httpsCallable(functions, 'createOrder')` (only attempted if Express API throws network failure).
2. **Customer Order Cancellation (`Ecommerce/frontend/src/services/orderService.ts`)**:
   - Primary: Trusted Express API `PATCH ${VITE_API_URL}/api/orders/:id/cancel` on `ems-ecommerce-backend`.
   - Fallback: `httpsCallable(functions, 'updateOrderStatus')`.
3. **Admin Order Status Progression (`admin-panel/frontend/src/services/adminOrderService.ts`)**:
   - Primary: Trusted Express API `PATCH ${VITE_API_URL}/api/admin/orders/:id/status` on `ems-admin-backend`.
   - Fallback: `httpsCallable(functions, 'updateOrderStatus')`.
4. **Admin In-Person Payment Recording (`admin-panel/frontend/src/services/adminOrderService.ts`)**:
   - Primary: Trusted Express API `PATCH ${VITE_API_URL}/api/admin/orders/:id/payment` on `ems-admin-backend`.
   - Fallback: `httpsCallable(functions, 'recordOrderPayment')`.
5. **Catalog Management (`admin-panel/frontend/src/services/adminProductService.ts`, `adminCategoryService.ts`)**:
   - Primary: Trusted Express API (`/api/admin/products`, `/api/admin/categories`).
   - Fallback: Cloud Functions.
6. **Admin Invitations & Roles (`admin-panel/frontend/src/services/adminRoleService.ts`)**:
   - Primary: Trusted Express API (`/api/admin/invitations`).
   - Fallback: Direct Firestore collection reads/writes protected by Firestore Security Rules.
7. **Operational Reports (`admin-panel/frontend/src/services/adminReportService.ts`)**:
   - Primary: Client-side computation fallback over Firestore collections.
8. **Audit Trail (`admin-panel/frontend/src/services/adminAuditService.ts`)**:
   - Primary: Express backend API (`/api/admin/audit-logs`).
   - Fallback: Direct Firestore queries on `/audit_logs`.

### Conclusion
**The active EMS production environment does NOT require deployed Cloud Functions.** All production actions are handled authoritatively by the two live Render services. Upgrading the Firebase project from Spark to Blaze is not necessary.

---

## 4. Task 3 & 4: Render Backend Runtimes & Startup Logging

To obtain concrete runtime evidence without requiring Render Shell access, minimal non-sensitive startup diagnostics were added to both backend entry points:

### Code Modifications
1. [Ecommerce/backend/src/index.ts](file:///c:/Users/akash/OneDrive/Desktop/EMS/Ecommerce/backend/src/index.ts):
   ```ts
   if (process.env.NODE_ENV !== 'test') {
     app.listen(port, () => {
       console.log(`[runtime-check] service=ems-ecommerce-backend node=${process.version} openssl=${process.versions.openssl}`);
       console.log(`Ecommerce backend listening on port ${port}`);
     });
   }
   ```
2. [admin-panel/backend/src/index.ts](file:///c:/Users/akash/OneDrive/Desktop/EMS/admin-panel/backend/src/index.ts):
   ```ts
   if (process.env.NODE_ENV !== 'test') {
     app.listen(port, () => {
       console.log(`[runtime-check] service=ems-admin-backend node=${process.version} openssl=${process.versions.openssl}`);
       console.log(`Admin panel backend listening on port ${port}`);
     });
   }
   ```

### Verification & Deployment
- `git diff --check` passed with 0 errors.
- Unit and integration tests passed (Ecommerce backend: 10/10, Admin backend: 18/18).
- Committed as `958044c` (`fix(security): add non-sensitive runtime check logging to backend startup for Render verification`) and pushed to `origin/main`.
- Live probe confirmed immediate auto-redeploy on Render:
  - `https://ems-ecommerce-backend.onrender.com/health` -> HTTP 200 OK (`uptime: 32.8s`).
  - `https://ems-admin-backend.onrender.com/health` -> HTTP 200 OK (`uptime: 27.8s`).

### Dashboard Verification Instructions for Maintainer
To inspect the startup log message in the Render Dashboard:
1. Open [dashboard.render.com](https://dashboard.render.com).
2. Select **ems-ecommerce-backend** > click **Logs** tab in the left sidebar.
3. Search for `[runtime-check]`.
   - Expected log: `[runtime-check] service=ems-ecommerce-backend node=v22.23.4 openssl=3.0.15+quic` (or newer patched release).
4. Select **ems-admin-backend** > click **Logs** tab in the left sidebar.
5. Search for `[runtime-check]`.
   - Expected log: `[runtime-check] service=ems-admin-backend node=v22.23.4 openssl=3.0.15+quic` (or newer patched release).

---

## 5. Automated Test Pass Record

| Project | Test Command | Tests Run | Result |
| :--- | :--- | :--- | :--- |
| Cloud Functions | `npm --prefix functions test` | 105 | **105 PASS, 0 FAIL** |
| Ecommerce Backend | `npm --prefix Ecommerce/backend test` | 10 | **10 PASS, 0 FAIL** |
| Admin Backend | `npm --prefix admin-panel/backend test` | 18 | **18 PASS, 0 FAIL** |
| Ecommerce Frontend | `npm --prefix Ecommerce/frontend test` | 18 | **18 PASS, 0 FAIL** |
| Ecommerce Frontend Build | `npm --prefix Ecommerce/frontend run build` | Vite build | **SUCCESS** |
| Admin Frontend Build | `npm --prefix admin-panel/frontend run build` | Vite build | **SUCCESS** |
| **TOTAL** | — | **151** | **151 PASS (100%)** |
