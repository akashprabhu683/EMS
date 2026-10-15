# EMS — Herbal & Natural Medicine Dispensary Management System

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%7C%20Firestore%20%7C%20Functions-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)

A full-stack ecommerce and dispensary management system tailored for authentic Ayurvedic, herbal, and natural medicines with an integrated **Click-and-Collect** counter pickup workflow.

---

## 🌿 Architecture Overview

EMS is organized as a unified monorepo containing three core packages:

```
EMS/
├── Ecommerce/frontend/       # Customer Storefront (React 19, Vite, Tailwind CSS)
├── admin-panel/frontend/    # Dispensary Admin Portal (React 19, Vite, Tailwind CSS)
├── functions/               # Cloud Functions Backend (Node.js, Firebase Admin SDK)
└── scripts/                 # Administrative tools (claim provisioning, DB scripts)
```

### 1. Storefront (`Ecommerce/frontend`)
- **Amazon-Inspired Hero Showcase**: Dynamic top showcase cards featuring curated categories, best-selling remedies, and special offers under ₹499 and ₹299.
- **Deal Filter Pill Strip**: Instant client-side filtering for budget values, 4.8+ star ratings, and classical formulations.
- **Click-and-Collect Workflow**: Customers browse the catalog, select medicines, authenticate with Google Sign-In, and reserve without upfront online payment.
- **Null-Safe Orders & Tracking**: View order status, dispensary pickup counter hours, and in-person payment confirmation.
- **Botanical Design System**: Clean emerald green palette with high-contrast typography and responsive layouts.

### 2. Admin Portal (`admin-panel/frontend`)
- **Secure Access Control**: Protected by Firebase Auth custom claims (`admin: true`).
- **Order Management & Fulfillment**: Real-time Firestore order tracking with transition controls (`pending` → `ready_for_pickup` → `completed` or `cancelled`).
- **Product & Inventory Catalog**: Create, edit, and toggle active/inactive status for herbal formulations with pricing in Indian Rupees (`₹`) and inventory stock levels.
- **Category Taxonomies**: Manage botanical categories with unique URL slugs and descriptions.

### 3. Backend Engine (`functions/`)
- **Click-and-Collect Placement**: Atomic transactional inventory decrement with idempotency key enforcement.
- **Role Validation**: Enforces server-side administrator authorization and prevents unauthorized status alterations.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v18+` or `v20+`
- **npm** or **pnpm**
- **Firebase CLI**: `npm install -g firebase-tools` (optional for local emulators)

---

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/akashprabhu683/EMS.git
   cd EMS
   ```

2. **Install dependencies for all workspaces:**
   ```bash
   # Install Storefront dependencies
   cd Ecommerce/frontend
   npm install

   # Install Admin Panel dependencies
   cd ../../admin-panel/frontend
   npm install

   # Install Cloud Functions dependencies
   cd ../../functions
   npm install
   ```

---

### Running Locally

Run both frontends simultaneously in separate terminal windows:

#### 1. Storefront
```bash
cd Ecommerce/frontend
npm run dev
```
Accessible at: `http://localhost:5173` (or the port Vite designates).

#### 2. Admin Panel
```bash
cd admin-panel/frontend
npm run dev
```
Accessible at: `http://localhost:5174` (or configured dev port).

#### 3. Firebase Emulators (Optional)
If running local Firestore, Auth, and Functions emulators:
```bash
firebase emulators:start
```

---

## 📋 Technology Stack

| Layer | Technology |
|---|---|
| **Storefront** | React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons |
| **Admin Panel** | React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons |
| **Authentication** | Firebase Authentication (Google Sign-In, Email/Password) |
| **Database** | Cloud Firestore (Real-time collections & transactions) |
| **Serverless Functions** | Firebase Cloud Functions (Node.js) |
| **Currency** | Indian Rupee (`₹`) |

---

## 🔒 Security & Admin Provisioning

To assign administrator privileges to an email account:

```bash
node scripts/set-admin-claim.mjs your-admin-email@example.com
```

This applies the `admin: true` custom claim required to pass the admin portal's `ProtectedRoute` verification.

---

## 📄 License

This project is licensed under the MIT License.