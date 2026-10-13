import { initializeApp, getApp, getApps } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
    connectFirestoreEmulator,
    getFirestore,
} from 'firebase/firestore';
import {
    connectFunctionsEmulator,
    getFunctions,
} from 'firebase/functions';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

const useEmulators =
    import.meta.env.DEV &&
    import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';

if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099');
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export default app;