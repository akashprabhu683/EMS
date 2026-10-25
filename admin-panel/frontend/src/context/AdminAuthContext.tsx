import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth, functions, db } from '../firebase';
import { doc, getDoc, onSnapshot, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import type { AdminUser } from '../types';
import {
  getNativeFcmToken,
  setupFcmTokenListener,
  registerAdminDeviceToken,
  unregisterAdminDeviceToken,
} from '../services/adminNotificationService';

export const PRIMARY_SUPERADMIN_EMAIL = 'akashprabhu0302@gmail.com';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

interface AdminAuthContextType {
  user: AdminUser | null;
  rawUser: User | null;
  isAdmin: boolean;
  isLoading: boolean;
  isRevoked: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshClaims: () => Promise<boolean>;
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [rawUser, setRawUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevoked, setIsRevoked] = useState(false);

  const verifyAdminClaims = useCallback(async (firebaseUser: User): Promise<boolean> => {
    try {
      const email = (firebaseUser.email || '').toLowerCase().trim();
      const isEmailVerified = Boolean(firebaseUser.emailVerified);
      const isSuperadmin = isEmailVerified && email === PRIMARY_SUPERADMIN_EMAIL.toLowerCase();

      // Force refresh token to obtain latest claims
      let tokenResult = await firebaseUser.getIdTokenResult(true);
      let hasAdminClaim = isSuperadmin || Boolean(tokenResult.claims.admin);

      // Check canonical Firestore admins collection
      try {
        const adminDoc = await getDoc(doc(db, 'admins', firebaseUser.uid));
        if (adminDoc.exists()) {
          const data = adminDoc.data();
          if (data?.isActive !== false || isSuperadmin) {
            hasAdminClaim = true;
          } else {
            hasAdminClaim = false;
          }
        } else if (isSuperadmin) {
          hasAdminClaim = true;
          // Check if an admin record for this email already exists before auto-creating
          try {
            const querySnap = await getDocs(query(collection(db, 'admins'), where('email', '==', email)));
            if (querySnap.empty) {
              setDoc(doc(db, 'admins', firebaseUser.uid), {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName || 'Dispensary Superadmin',
                role: 'superadmin',
                isActive: true,
                grantedBy: 'initial_setup',
                grantedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
              }, { merge: true }).catch(console.warn);
            }
          } catch (qErr) {
            console.warn('[AdminAuthContext] Could not verify existing admin by email:', qErr);
          }
        } else if (email && isEmailVerified) {
          // Check if admin document exists by verified email
          const querySnap = await getDocs(query(collection(db, 'admins'), where('email', '==', email)));
          if (!querySnap.empty && querySnap.docs[0].data()?.isActive !== false) {
            hasAdminClaim = true;
          } else if (!isSuperadmin) {
            hasAdminClaim = false;
          }
        } else {
          hasAdminClaim = false;
        }
      } catch (docErr) {
        console.warn('Checking admins collection in Firestore failed:', docErr);
        if (isSuperadmin) {
          hasAdminClaim = true;
        }
      }

      setIsAdmin(hasAdminClaim);
      setIsRevoked(!hasAdminClaim);
      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        isAdmin: hasAdminClaim,
      });
      return hasAdminClaim;
    } catch (err) {
      console.error('Failed to verify admin custom claims:', err);
      const isSuper = Boolean(firebaseUser.emailVerified) && (firebaseUser.email || '').toLowerCase().trim() === PRIMARY_SUPERADMIN_EMAIL.toLowerCase();
      setIsAdmin(isSuper);
      setIsRevoked(!isSuper);
      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        isAdmin: isSuper,
      });
      return isSuper;
    }
  }, []);

  // Listen for Firebase Auth state changes
  useEffect(() => {
    let adminDocUnsub: (() => void) | null = null;
    let revocationDocUnsub: (() => void) | null = null;
    let tokenListenerUnsub: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setRawUser(firebaseUser);

      if (adminDocUnsub) {
        adminDocUnsub();
        adminDocUnsub = null;
      }
      if (revocationDocUnsub) {
        revocationDocUnsub();
        revocationDocUnsub = null;
      }
      if (tokenListenerUnsub) {
        tokenListenerUnsub();
        tokenListenerUnsub = null;
      }

      if (firebaseUser) {
        const hasAdminAccess = await verifyAdminClaims(firebaseUser);
        const isSuperadmin = Boolean(firebaseUser.emailVerified) && (firebaseUser.email || '').toLowerCase().trim() === PRIMARY_SUPERADMIN_EMAIL.toLowerCase();

        // If authorized as an administrator, bind native FCM device registration
        if (hasAdminAccess) {
          const registerCurrentAdminToken = async (token: string) => {
            try {
              await registerAdminDeviceToken(firebaseUser.uid, token, 'android');
            } catch (err) {
              console.warn('[AdminAuthContext] Device token registration error:', err);
            }
          };

          const existingToken = getNativeFcmToken();
          if (existingToken) {
            registerCurrentAdminToken(existingToken);
          }

          tokenListenerUnsub = setupFcmTokenListener((token) => {
            registerCurrentAdminToken(token);
          });
        }

        // Listener 1: Watch the admin's role document at /admins/{uid}
        adminDocUnsub = onSnapshot(
          doc(db, 'admins', firebaseUser.uid),
          (snapshot) => {
            if (isSuperadmin) {
              setIsAdmin(true);
              setIsRevoked(false);
              setUser((prev) => (prev ? { ...prev, isAdmin: true } : null));
              return;
            }
            if (!snapshot.exists()) {
              setIsAdmin(false);
              setIsRevoked(true);
              setUser((prev) => (prev ? { ...prev, isAdmin: false } : null));
            } else {
              const active = snapshot.data()?.isActive !== false;
              setIsAdmin(active);
              setIsRevoked(!active);
              setUser((prev) => (prev ? { ...prev, isAdmin: active } : null));
            }
          },
          (error) => {
            if (!isSuperadmin && error.code === 'permission-denied') {
              setIsAdmin(false);
              setIsRevoked(true);
              setUser((prev) => (prev ? { ...prev, isAdmin: false } : null));
            }
          }
        );

        // Listener 2: Watch dedicated real-time revocation broadcast signal at /admin_revocations/{uid}
        revocationDocUnsub = onSnapshot(
          doc(db, 'admin_revocations', firebaseUser.uid),
          (snapshot) => {
            if (!isSuperadmin && snapshot.exists()) {
              setIsAdmin(false);
              setIsRevoked(true);
              setUser((prev) => (prev ? { ...prev, isAdmin: false } : null));
            }
          },
          (err) => {
            console.warn('Revocation broadcast listener note:', err.message);
          }
        );
      } else {
        setUser(null);
        setIsAdmin(false);
        setIsRevoked(false);
      }
      setIsLoading(false);
    });

    return () => {
      authUnsubscribe();
      if (adminDocUnsub) adminDocUnsub();
      if (revocationDocUnsub) revocationDocUnsub();
      if (tokenListenerUnsub) tokenListenerUnsub();
    };
  }, [verifyAdminClaims]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      await verifyAdminClaims(cred.user);
    } finally {
      setIsLoading(false);
    }
  }, [verifyAdminClaims]);

  const loginWithGoogle = useCallback(async () => {
    setIsLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await verifyAdminClaims(cred.user);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        return;
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [verifyAdminClaims]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentUid = auth.currentUser?.uid;
      const token = getNativeFcmToken();
      if (currentUid && token) {
        try {
          await unregisterAdminDeviceToken(currentUid, token);
        } catch (err) {
          console.warn('[AdminAuthContext] Token unregistration failed on logout:', err);
        }
      }
      await signOut(auth);
      setUser(null);
      setIsAdmin(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshClaims = useCallback(async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    setIsLoading(true);
    try {
      return await verifyAdminClaims(auth.currentUser);
    } finally {
      setIsLoading(false);
    }
  }, [verifyAdminClaims]);

  return (
    <AdminAuthContext.Provider
      value={{
        user,
        rawUser,
        isAdmin,
        isLoading,
        isRevoked,
        login,
        loginWithGoogle,
        logout,
        refreshClaims,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return ctx;
}
