# EMS Notification Policy & Implementation

**Status:** Authoritative Repository Policy across All Five Upgrade Phases  
**Date:** October 2026  
**Architecture Reference:** Click-and-Collect Dispensary, Firebase Cloud Messaging (FCM), In-App Status Streaming, and Mobile Push.

---

## 1. Notification Policy Overview

EMS operates as a physical, in-person dispensary counter specializing in curated Ayurvedic & herbal remedies with Click & Collect fulfillment. Because a custom enterprise domain and transactional email automation service are currently unavailable:

1. **Email Notifications for Orders are Disallowed:** Customer and administrator transactional email notifications (order placement receipts, collection readiness emails, cancellation emails) are disabled as product features.
2. **Administrator Onboarding Email Provisioning is Preserved:** Admin team invitations are part of secure account provisioning (not order notifications). The invitation system generates verifiable tokens, supports copyable invitation links for instant onboarding, and supports Resend email delivery if `RESEND_API_KEY` is configured.
3. **No Unapproved Third-Party Gateways:** SMS (Fast2SMS) and WhatsApp gateways are explicitly prohibited without prior written approval. No online payment functionality exists or may be added.
4. **Authoritative Push Channel:** **Firebase Cloud Messaging (FCM)** is the official push notification channel for customer and administrator mobile applications (Android APK & native wrappers).
5. **Authoritative Fallback Channel:** **In-App Notification Stream** (`/users/{uid}/notifications`) provides an instant, real-time alert feed accessible on the customer website header and orders page.

---

## 2. Notification Event Architecture

### Customer Events
| Event | Trigger | FCM Push Title & Message | In-App Alert | Sanitization & Privacy |
| :--- | :--- | :--- | :--- | :--- |
| **Order Placed** | Order document created in `/orders/{id}` | **Order Confirmed — EMS Dispensary**<br/>"Hello {name}, your Click & Collect order #{shortId} has been confirmed. We will prepare your remedies shortly." | Saved to `/users/{uid}/notifications` | No raw PIN, payment tokens, or full addresses in push body. |
| **Accepted** | Status &rarr; `accepted` | **Order Accepted — EMS Dispensary**<br/>"Order #{shortId} has been accepted by our dispensary pharmacists." | Saved to `/users/{uid}/notifications` | Standard operational message. |
| **Preparing** | Status &rarr; `preparing` | **Order Being Prepared — EMS Dispensary**<br/>"Your remedies for order #{shortId} are being packed and verified." | Saved to `/users/{uid}/notifications` | Non-sensitive status message. |
| **Ready for Collection** | Status &rarr; `ready_for_pickup` | **🌿 Ready for Collection — EMS Dispensary**<br/>"Order #{shortId} is ready at the dispensary counter! Please present your 6-digit verification PIN upon collection." | Saved to `/users/{uid}/notifications` | **Critical Security:** The 6-digit PIN is NOT exposed in plain-text notification headers; customer must view inside the authenticated app/website. |
| **Collected** | Status &rarr; `collected` | **Order Collected — EMS Dispensary**<br/>"Order #{shortId} was collected. Thank you for choosing EMS for your herbal wellness!" | Saved to `/users/{uid}/notifications` | Closing audit confirmation. |
| **Cancelled** | Status &rarr; `cancelled` | **Order Cancelled — EMS Dispensary**<br/>"Click & Collect order #{shortId} has been cancelled. Please visit our website or dispensary if you need assistance." | Saved to `/users/{uid}/notifications` | Informative notice with staff contact options. |

### Administrator Operational Alerts
| Alert Type | Trigger | FCM Push Body | Admin Stream Record |
| :--- | :--- | :--- | :--- |
| **New Order Placed** | Order document created | **New Order #{shortId} (₹{total})**<br/>"Click & Collect order placed by {name}. Awaiting dispensary acceptance." | Recorded in `/admin_notifications` |
| **Stock Alert** | Product inventory falls to/below `lowStockThreshold` | **Low Stock Alert: {productName}**<br/>"{currentStock} units remaining (threshold: {threshold})." | Recorded in `/admin_notifications` & `/audit_logs` |

---

## 3. FCM Device Token Lifecycle

Device registration tokens are managed securely in Firestore subcollections:

- **Customer Tokens:** `/users/{uid}/fcm_tokens/{tokenId}`
  - Schema: `{ token: string, platform: 'android' | 'web', createdAt: Timestamp, updatedAt: Timestamp }`
  - Access Rules: Only the authenticated user (`isOwner(uid)`) or an administrator can read/write.
- **Admin Tokens:** `/admins/{uid}/fcm_tokens/{tokenId}`
  - Schema: `{ token: string, platform: 'android' | 'web', createdAt: Timestamp, updatedAt: Timestamp }`
  - Access Rules: Only the authenticated administrator can read/write.

### Token Registration & Refresh
- Authenticated clients register their token via the `registerFcmToken` callable Cloud Function or direct Firestore write to their subcollection.
- Upon token refresh (handled automatically by Firebase SDK), the new token is updated with an updated timestamp.

### Token Invalidation on Logout
- When a customer or administrator signs out, `unregisterFcmToken` is called to immediately delete the token document, preventing delivery to shared or unauthenticated devices.
- Backend FCM dispatch (`functions/src/notifications.ts`) automatically detects dead or expired tokens (`messaging/registration-token-not-registered`, `messaging/invalid-registration-token`) and batched-deletes them.

---

## 4. Website Customer Experience & Fallback

### Dismissible App-Installation Banner
On signed-in customer pages (`/orders`, `/order-confirmation`, `/profile`), a non-intrusive dismissible banner informs customers that real-time mobile push notifications are supported via the EMS Android application:
- **Platform Detection:** Differentiates Android devices from desktop/iOS.
- **Verified Link:** Points to the verified repository releases/downloads without fabricated links.
- **Persistence:** User dismissal is remembered in `localStorage` (`ems_app_banner_dismissed_v1`) to prevent repetitive interruptions.

### Website Notification Dropdown (`NotificationCenter.tsx`)
Customers who access EMS exclusively through desktop or mobile web browsers receive a dedicated notification center:
- Live unread badge in navigation header.
- Chronological list of order status alerts with relative timestamps.
- "Mark all as read" control.
- Direct click-through navigation to the relevant order in the order queue.

---

## 5. Security Rules Verification (`firestore.rules`)

```javascript
match /users/{uid} {
  allow read, write: if isOwner(uid) || isAdmin();

  match /fcm_tokens/{tokenId} {
    allow read, write: if isOwner(uid) || isAdmin();
  }

  match /notifications/{notifId} {
    allow read, update: if isOwner(uid) || isAdmin();
    allow create, delete: if isAdmin();
  }
}

match /admins/{uid} {
  allow read: if isAdmin() || (isAuthenticated() && request.auth.uid == uid);
  allow write: if isAdmin();

  match /fcm_tokens/{tokenId} {
    allow read, write: if (isAuthenticated() && request.auth.uid == uid) || isAdmin();
  }
}

match /admin_notifications/{notifId} {
  allow read, update: if isAdmin();
  allow create, delete: if false; // Server-created only
}
```
