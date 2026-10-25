# EMS — Herbal & Natural Medicine Dispensary Management System

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%7C%20Firestore%20%7C%20FCM-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Android](https://img.shields.io/badge/Android-Native%20FCM%20Bridge-3DDC84?logo=android&logoColor=white)](https://developer.android.com/)

A modern, production-grade ecommerce and dispensary management system tailored for authentic Ayurvedic, herbal, and natural medicines with Click-and-Collect counter pickup, real-time status tracking, native Android FCM push notifications, and administrative delegation.

---

## 🌐 Live Deployments

| Component | Platform | Live URL |
|---|---|---|
| **Customer Storefront** | Vercel | [ecommerce-storefront-client.vercel.app](https://ecommerce-storefront-client.vercel.app) |
| **Dispensary Admin Portal** | Vercel | [ems-admin-portal.vercel.app](https://ems-admin-portal.vercel.app) |
| **Ecommerce API Backend** | Render | [ems-ecommerce-backend.onrender.com](https://ems-ecommerce-backend.onrender.com) |
| **Admin API Backend** | Render | [ems-admin-backend.onrender.com](https://ems-admin-backend.onrender.com) |

---

## 🌿 Architecture Overview

EMS is organized as a unified monorepo running on a ₹0 free-tier architecture (no Firebase Blaze or paid serverless functions required):

```
EMS/
├── Ecommerce/
│   ├── frontend/             # Customer Storefront (React 19, Vite, Tailwind CSS v4)
│   └── backend/              # Customer API (Express, Node.js, Firebase Admin SDK)
├── admin-panel/
│   ├── frontend/             # Dispensary Admin Portal (React 19, Vite, Tailwind CSS v4)
│   └── backend/              # Admin API (Express, Node.js, Firebase Admin SDK)
├── android/                  # Native Android WebView wrappers with bi-directional FCM bridge
├── firebase/                 # Production Firestore security rules & indexes
└── apks/                     # Release-ready Android APK packages
```

### 1. Customer Storefront (`Ecommerce/frontend`)
- **Herbal Showcase**: Curated categories, deal filter pill strip, and remedies under ₹499 and ₹299.
- **Click-and-Collect Workflow**: Reserve remedies with Google Sign-In and collect in person with zero online transaction fees.
- **Push & In-App Notifications**: Real-time Firestore notification center and native Android FCM alerts with dedicated notification channels (`order_updates`).
- **Eye-Level Toasts**: Top-center pop notifications with smooth scale and slide physics.

### 2. Admin Portal (`admin-panel/frontend`)
- **Role-Based Security**: Superadmin control with secure cryptographic admin invitation delegation (`/accept-invite`).
- **Order Pipeline Fulfillment**: Transition orders through `placed` → `accepted` → `preparing` → `ready_for_pickup` → `collected` / `cancelled`.
- **Instant Dispatch Telemetry**: Status updates trigger multicast FCM push notifications to the customer's registered devices with observable diagnostic logging.
- **Product & Category Management**: Dynamic inventory counters, pricing in Indian Rupees (`₹`), and botanical taxonomy management.

### 3. Dedicated Express Backends (`Ecommerce/backend` & `admin-panel/backend`)
- **Zero-Cost Free Tier**: Hosted on Render without Blaze billing requirements.
- **Order Idempotency**: Cryptographic fingerprinting prevents double submissions.
- **Credential Protection**: Strict device token masking (`maskToken`) and token hash storage in Firestore.
- **CORS Protection**: Explicit domain allowlists for production and staging origins.

### 4. Native Android Apps (`android/`)
- Native WebView wrappers injecting secure `window.EMSAndroid` JavaScript bridges.
- Foreground, background, and terminated push notification delivery via Firebase Cloud Messaging.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v20+` or `v22+`
- **npm** or **pnpm**
- **Git**

---

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/akashprabhu683/EMS.git
   cd EMS
   ```

2. **Install dependencies:**
   ```bash
   # Customer Storefront & Backend
   cd Ecommerce/frontend && npm install
   cd ../backend && npm install

   # Admin Portal & Backend
   cd ../../admin-panel/frontend && npm install
   cd ../backend && npm install
   ```

---

### Running Locally

Run the frontend and backend services concurrently:

#### 1. Storefront & API
```bash
# Terminal 1: Ecommerce Backend
cd Ecommerce/backend
npm run dev

# Terminal 2: Storefront Client
cd Ecommerce/frontend
npm run dev
```

#### 2. Admin Portal & API
```bash
# Terminal 3: Admin Backend
cd admin-panel/backend
npm run dev

# Terminal 4: Admin Portal Client
cd admin-panel/frontend
npm run dev
```

---

## 🧪 Testing & Verification

Run automated test suites across both backends:

```bash
# Admin Backend Tests (Auth, CORS, Sanitizers, FCM status dispatch)
cd admin-panel/backend
npm test

# Ecommerce Backend Tests (CORS, Idempotency, Fingerprinting, Notifications)
cd Ecommerce/backend
npm test
```

---

## 🔒 Security & Admin Provisioning

- **Invitation System**: The primary superadmin generates secure, cryptographically hashed invitation links (`/accept-invite?token=...`) directly from the Admin Portal.
- **Firestore Rules**: Strict path-based and claim-based access controls enforcing token ownership and admin authorization.
- **Token Protection**: Plaintext tokens are never stored in Firestore documents; device tokens are masked in server logs.

---

## 📄 License

This project is licensed under the MIT License.