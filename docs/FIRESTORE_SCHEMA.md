# EMS Firestore Database Schema

Firebase project: ems-store-6a342
Database: Cloud Firestore (default)
Region: asia-south1 (Mumbai)

## 1. users/{uid}
- name: string, required
- email: string, required, normalized
- phone: string, optional
- createdAt: timestamp, server-generated
- updatedAt: timestamp, server-generated

Document ID: Firebase Authentication UID.

## 2. categories/{categoryId}
- name: string, required
- slug: string, required, unique
- description: string, optional
- isActive: boolean, required
- createdAt: timestamp, server-generated
- updatedAt: timestamp, server-generated

## 3. products/{productId}
- name: string, required
- description: string, required
- categoryId: string, required
- price: integer, required, stored in paise
- imageUrl: string, optional, HTTPS URL
- stock: integer, required, minimum 0
- isActive: boolean, required
- createdAt: timestamp, server-generated
- updatedAt: timestamp, server-generated

## 4. carts/{uid}
- items: array of objects
  - productId: string
  - quantity: integer, positive and bounded
- updatedAt: timestamp, server-generated

Document ID: Firebase Authentication UID.
Cart prices must be fetched from trusted product documents at checkout.

## 5. orders/{orderId}
- userId: string, required
- items: array of immutable purchase snapshots
  - productId: string
  - name: string
  - unitPrice: integer, paise
  - quantity: integer
  - lineTotal: integer, paise
- subtotal: integer, paise
- shippingFee: integer, paise
- total: integer, paise
- shippingAddress: map
  - name: string
  - phone: string
  - line1: string
  - line2: string, optional
  - city: string
  - state: string
  - postalCode: string
- orderStatus: string
  - pending, confirmed, processing, shipped, delivered, cancelled
- paymentStatus: string
  - pending, paid, failed, cod_pending, refunded
- paymentMethod: string
  - razorpay, cod
- createdAt: timestamp, server-generated
- updatedAt: timestamp, server-generated

## Security requirements
- Customers can access only their own profiles, carts and orders.
- Admin access must use trusted Firebase Authentication custom claims.
- Never trust client-supplied prices, totals, stock updates or payment status.
- Use Firestore transactions for stock validation and order creation.
- Online payments require trusted payment verification.
- Never store card numbers or CVVs.

## Relationships
- products.categoryId references categories/{categoryId}.
- carts/{uid} belongs to the authenticated customer.
- orders.userId identifies the customer who placed the order.
- Order items and shipping addresses are snapshots.

## Indexes
See ../firebase/firestore.indexes.json.

## Deployment status
Schema documented locally. Deploy indexes and reviewed security rules
only after backend implementation and testing.
