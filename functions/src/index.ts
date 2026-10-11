import { setGlobalOptions } from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
admin.initializeApp();

// Set global options for Cloud Functions
setGlobalOptions({ maxInstances: 10 });

// Export callable functions
export { createOrder } from "./orders.js";
