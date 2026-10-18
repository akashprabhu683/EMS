import { setGlobalOptions } from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
admin.initializeApp();

// Set global options for Cloud Functions
setGlobalOptions({ maxInstances: 10, region: "us-central1" });

// 1. Order Management & Checkout
export { createOrder } from "./orders.js";

// 2. Automated Inventory Deduction & Restoration
export {
  onOrderCreatedInventory,
  onOrderCancelledInventory,
} from "./inventory.js";

// 3. Customer SMS / WhatsApp Notification Alerts
export {
  onOrderCreatedNotification,
  onOrderStatusNotification,
} from "./notifications.js";

// 4. In-App Admin Role Delegation & Management
export {
  listAdmins,
  grantAdminRole,
  resendAdminInvitation,
  verifyInvitationToken,
  acceptAdminInvitation,
  revokeAdminRole,
  checkAndActivatePendingAdmin,
} from "./adminRoles.js";
