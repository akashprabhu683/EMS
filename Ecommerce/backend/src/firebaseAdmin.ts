import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

let initializedApp: admin.app.App;

export function getFirebaseAdmin(): admin.app.App {
  if (initializedApp) {
    return initializedApp;
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID || 'ems-store-6a342';

  if (serviceAccountKey) {
    try {
      // Allow raw JSON string or base64 encoded JSON
      const parsed = serviceAccountKey.trim().startsWith('{')
        ? JSON.parse(serviceAccountKey)
        : JSON.parse(Buffer.from(serviceAccountKey, 'base64').toString('utf-8'));

      initializedApp = admin.initializeApp({
        credential: admin.credential.cert(parsed),
        projectId,
      });
      return initializedApp;
    } catch (err) {
      console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, falling back to default:', err);
    }
  }

  initializedApp = admin.initializeApp({
    projectId,
  });

  return initializedApp;
}

export const adminApp = getFirebaseAdmin();
export const adminDb = adminApp.firestore();
export const adminAuth = adminApp.auth();
