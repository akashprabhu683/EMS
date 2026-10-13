# NovaShop – E-Commerce Frontend

NovaShop is an ultra-modern, high-performance e-commerce frontend built with **React 19**, **Vite**, and **Tailwind CSS v4**. It features a sleek glassmorphic dark-mode design, smooth animations, comprehensive filtering, shopping cart drawer, and complete checkout flow.

---

## 🚀 Features

- **Hero & Landing Experience**: Dynamic interactive carousel banners, promotional sale ribbons, curated collection teasers, and trust badges.
- **Product Catalog (`/products`)**:
  - Live search filtering across name, description, and tags.
  - Multi-category filtering (Electronics, Fashion, Beauty, Home, Sports, Accessories).
  - Price range slider, star rating filters, and in-stock toggles.
  - Multi-mode sorting (Featured, Newest, Price Low → High, Price High → Low, Top Rated).
  - Grid and list view modes.
- **Product Detail (`/product/:id`)**:
  - Multi-angle image gallery with interactive thumbnail switching.
  - Interactive variant swatches (color palettes, storage/size options).
  - Quantity counter with real-time stock status check.
  - Tabbed specification sheet, customer reviews, and shipping details.
  - Related product recommendations.
- **Cart & Slide-Over Drawer**:
  - Persistent shopping cart (state preserved during browsing).
  - Live item quantity increment/decrement/removal.
  - Real-time subtotal, free shipping threshold calculation, and total calculation.
  - Global drawer open/close triggers.
- **Multi-Step Checkout (`/checkout`)**:
  - Shipping address collection with form validation.
  - Payment method selection (Credit/Debit Card, Apple Pay / Google Pay, Cash on Delivery).
  - Order summary breakdown with promo code discount application.
- **Order Confirmation (`/order-confirmation`)**:
  - Generated order identifier and status timeline.
- **Authentication Modal & Page (`/login`)**:
  - Sign in / Sign up tabbed interface with mock user authentication context.

---

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/)
- **Build Tool**: [Vite 8](https://vite.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) with custom design tokens & glassmorphism
- **Routing**: [React Router v7](https://reactrouter.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Linter**: [Oxlint](https://oxc.rs/docs/guide/usage/linter)

---

## 📁 Directory Structure

```text
ems/ecommerce/
├── public/              # Static assets & favicon
├── src/
│   ├── assets/          # Project assets
│   ├── components/      # Reusable UI components
│   │   ├── CartDrawer.tsx
│   │   ├── Footer.tsx
│   │   ├── Navbar.tsx
│   │   └── ProductCard.tsx
│   ├── context/         # React Contexts (AuthContext, CartContext)
│   ├── data/            # Mock product catalog & categories
│   ├── pages/           # Application views
│   │   ├── HomePage.tsx
│   │   ├── ProductsPage.tsx
│   │   ├── ProductDetailPage.tsx
│   │   ├── CheckoutPage.tsx
│   │   ├── LoginPage.tsx
│   │   └── OrderConfirmationPage.tsx
│   ├── types/           # TypeScript data models and interfaces
│   ├── App.tsx          # Router configuration and layout wrapper
│   ├── index.css        # Global Tailwind tokens, animations & glass styles
│   └── main.tsx         # Application root entrypoint
├── .env                 # Local environment variables
├── .env.example         # Environment template
├── index.html           # HTML5 shell with Google Fonts
├── package.json         # Dependencies & scripts
├── tailwind.config.js   # Tailwind configuration
├── tsconfig.json        # TypeScript project configuration
├── vite.config.ts       # Vite configuration with React & Tailwind plugins
└── README.md
```

---

## 🚦 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Copy the example environment configuration:
```bash
cp .env.example .env
```

### 3. Start Development Server
```bash
npm run dev
```
The server will start on `http://localhost:5173`.

### 4. Build for Production
```bash
npm run build
```
Generates an optimized, tree-shaken static production bundle in `dist/`.

### 5. Preview Production Build
```bash
npm run preview
```

---

## 🌐 Deployment Setup

### Vercel / Netlify / Cloudflare Pages
The build outputs a single-page application (SPA) to the `dist/` folder:
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **SPA Rewrite Rule**: Route all requests `/*` to `/index.html`

---

## 📌 Implementation Sequence Status

- [x] **Step 1: E-commerce Frontend** *(Completed)*
- [ ] **Step 2: E-commerce backend and Firebase database integration** *(Next)*
- [ ] **Step 3: Admin dashboard frontend**
- [ ] **Step 4: Admin dashboard backend and Firebase database integration**
- [ ] **Step 5: Connect and test both projects against the same Firebase project with role-based security**
