import { setGlobalOptions } from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
admin.initializeApp();

// Set global options for Cloud Functions
setGlobalOptions({ maxInstances: 10, region: "us-central1" });

// 1. Order Management & Checkout
export {
  createOrder,
  updateOrderStatus,
  recordOrderPayment,
  correctOrderPayment,
} from "./orders.js";

// 2. Automated Inventory Deduction & Restoration
export {
  onOrderCreatedInventory,
  onOrderCancelledInventory,
} from "./inventory.js";

// 3. Customer & Admin FCM Push Notifications & In-App Alerts
export {
  onOrderCreatedNotification,
  onOrderStatusNotification,
  registerFcmToken,
  unregisterFcmToken,
} from "./notifications.js";

// 4. In-App Admin Role Delegation & Management
export {
  listAdmins,
  grantAdminRole,
  verifyInvitationToken,
  acceptAdminInvitation,
  revokeAdminRole,
  checkAndActivatePendingAdmin,
} from "./adminRoles.js";

// 5. Append-Only Server Audit Trail
export {
  getAuditLogs,
  onProductWrittenAudit,
} from "./audit.js";

// 6. Operational & Financial Reporting Engine
export {
  getOperationalReport,
} from "./reports.js";

// 7. Authoritative Catalog & Inventory Management
export {
  createAdminProduct,
  updateAdminProduct,
  adjustAdminProductStock,
  setAdminProductStatus,
  deleteAdminProduct,
  createAdminCategory,
  updateAdminCategory,
  setAdminCategoryStatus,
  deleteAdminCategory,
} from "./catalog.js";

