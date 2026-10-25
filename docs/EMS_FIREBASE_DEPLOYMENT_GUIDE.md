# EMS — Firebase Production Deployment & Verification Guide

This document establishes the verified deployment configuration and release procedures for Firebase services within the EMS (Ecommerce Management System) repository.

---

## 1. Verified Target Environment

| Resource | Target Specification | Reference / Origin |
| :--- | :--- | :--- |
| **Firebase Project** | `ems-store-6a342` | Explicitly configured in `.firebaserc` and `package.json` |
| **Functions Region** | `us-central1` | Defined globally via `setGlobalOptions({ maxInstances: 10, region: "us-central1" })` in `functions/src/index.ts` |
| **Functions Runtime** | Node.js 22 | Defined in `functions/package.json` (`engines.node: "22"`) |
| **Firestore Database** | `(default)` | Region `asia-south1` |
| **Firestore Rules** | `firebase/firestore.rules` | Configured in `firebase.json` |
| **Firestore Indexes** | `firebase/firestore.indexes.json` | 6 composite indexes configured in `firebase.json` |
| **Storage Rules** | `firebase/storage.rules` | Configured in `firebase.json` |
| **Web Frontends** | Vercel (`ecommerce-storefront-client.vercel.app` & `ems-admin-portal.vercel.app`) | Deployed automatically from GitHub commits |
| **Express Backends** | Render (`ems-ecommerce-backend.onrender.com`) | Deployed automatically via Render webhooks |

---

## 2. Pre-Deployment Build & Test Gate

Before any manual or automated deployment, all local test and build gates must pass cleanly:

```powershell
# 1. Cloud Functions TypeScript Build & Tests (105 tests)
npm --prefix functions run build
npm --prefix functions test

# 2. Firestore Security Rules Emulator Tests (8 test suites)
node functions/test/emulatorSecurityRules.test.mjs

# 3. Admin Backend Route & Authorization Tests (6 tests)
node --test admin-panel/backend/test/authAndAuditRoutes.test.mjs

# 4. Customer Storefront Tests & Production Build (18 tests)
npm --prefix Ecommerce/frontend test
npm --prefix Ecommerce/frontend run build

# 5. Admin Portal Production Build
npm --prefix admin-panel/frontend run build

# 6. Android Debug Variants Assembly (Storefront & Admin APKs)
cd android
.\gradlew.bat assembleStorefrontDebug assembleAdminDebug
cd ..
```

---

## 3. Deployment Strategy

To prevent accidental deployments to production, EMS uses a **two-tier deployment strategy**:

### Option A: GitHub Actions Workflow (Recommended for Team Releases)
- **Workflow File**: [firebase-deploy.yml](file:///C:/Users/akash/OneDrive/Desktop/EMS/.github/workflows/firebase-deploy.yml)
- **Trigger**: Strictly `workflow_dispatch` (Manual trigger with required inputs).
- **Protection**:
  - Requires entering the exact confirmation token: `DEPLOY-EMS-PROD`.
  - Configured with `environment: production` requiring GitHub Environment reviewer approvals.
  - Automatically runs the full `functions test` suite before executing any deployment command.
  - Never deploys blindly on push or merge to `main`.
- **Secret Requirement**: Store a service account key JSON as `FIREBASE_SERVICE_ACCOUNT_EMS_STORE_6A342` in GitHub repository secrets (or `FIREBASE_TOKEN`).

### Option B: Explicit Manual CLI Deployment (Authorized Maintainer Release)
Every script explicitly passes `--project ems-store-6a342` to eliminate ambiguity:

```powershell
# Deploy Cloud Functions only
npm run deploy:firebase:functions

# Deploy Firestore Security Rules & Indexes only
npm run deploy:firebase:firestore

# Deploy Storage Security Rules only
npm run deploy:firebase:storage

# Deploy all Security Rules (Firestore + Storage)
npm run deploy:firebase:rules

# Deploy all Firebase Backend services together
npm run deploy:firebase:all
```

---

## 4. Post-Deployment Verification Steps

### 1. Verify Cloud Functions
Execute a live probe of callable functions using the client frontend or test harness:
1. Log into the Storefront app and place a Click & Collect test order (`createOrder`).
2. Verify order document is created in Firestore under `/orders/{orderId}`.
3. Check Cloud Functions logs in Google Cloud Console or via CLI:
   ```powershell
   firebase functions:log --project ems-store-6a342 --only createOrder,registerFcmToken
   ```

### 2. Verify Firestore Security Rules
1. Verify that direct client writes to catalog collections (`/categories` and `/products`) return `403 Permission Denied`.
2. Verify that customer accounts cannot read or write another customer's orders or user profiles.
3. Verify that deactivated admins (`isActive: false` or in `/admin_revocations`) cannot access admin endpoints.

### 3. Verify Storage Security Rules
1. In the Admin Portal, upload a product photo (< 5MB JPEG/PNG) via `/products`. Verify upload succeeds.
2. Attempt unauthenticated or non-admin upload to `/products/test.jpg` and verify it returns HTTP 403.

### 4. Verify Firestore Indexes
In the Firebase Console (`https://console.firebase.google.com/project/ems-store-6a342/firestore/indexes`):
1. Confirm that all 6 composite indexes show state `Enabled` (not `Building` or `Failed`):
   - `orders`: `userId ASC, createdAt DESC`
   - `orders`: `orderStatus ASC, createdAt DESC`
   - `products`: `isActive ASC, categoryId ASC, createdAt DESC`
   - `audit_logs`: `action ASC, timestamp DESC`
   - `audit_logs`: `target.collection ASC, timestamp DESC`
   - `audit_logs`: `action ASC, target.collection ASC, timestamp DESC`
