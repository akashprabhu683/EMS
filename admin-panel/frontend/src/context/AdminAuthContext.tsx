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
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import type { AdminUser } from '../types';

const googleProvider = new GoogleAuthProvider();

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
      // Force refresh token to obtain the latest server-signed custom claims
      let tokenResult = await firebaseUser.getIdTokenResult(true);
      let hasAdminClaim = Boolean(tokenResult.claims.admin);

      // Check canonical Firestore admins collection
      try {
        const adminDoc = await getDoc(doc(db, 'admins', firebaseUser.uid));
        if (adminDoc.exists()) {
          hasAdminClaim = true;
        } else {
          // If the admin document was removed from /admins/{uid}, treat as not admin
          hasAdminClaim = false;
        }
      } catch (docErr) {
        console.warn('Checking admins collection in Firestore failed:', docErr);
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
      setIsAdmin(false);
      setIsRevoked(true);
      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        isAdmin: false,
      });
      return false;
    }
  }, []);

  // Listen for Firebase Auth state changes
  useEffect(() => {
    let adminDocUnsub: (() => void) | null = null;
    let revocationDocUnsub: (() => void) | null = null;

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

      if (firebaseUser) {
        await verifyAdminClaims(firebaseUser);

        // Listener 1: Watch the admin's role document at /admins/{uid}
        // If the owner deletes this document, it immediately triggers snapshot.exists() === false!
        adminDocUnsub = onSnapshot(
          doc(db, 'admins', firebaseUser.uid),
          (snapshot) => {
            if (!snapshot.exists()) {
              // Admin role document deleted by owner! Revoke instantly without waiting for token expiry.
              setIsAdmin(false);
              setIsRevoked(true);
              setUser((prev) => (prev ? { ...prev, isAdmin: false } : null));
            } else {
              setIsAdmin(true);
              setIsRevoked(false);
              setUser((prev) => (prev ? { ...prev, isAdmin: true } : null));
            }
          },
          (error) => {
            // Permission denied error occurs if firestore rules cut off access — which also signifies revocation!
            if (error.code === 'permission-denied') {
              setIsAdmin(false);
              setIsRevoked(true);
              setUser((prev) => (prev ? { ...prev, isAdmin: false } : null));
            }
          }
        );

        // Listener 2: Watch dedicated real-time revocation broadcast signal at /admin_revocations/{uid}
        // When owner revokes access, this document is created and fires instantly.
        revocationDocUnsub = onSnapshot(
          doc(db, 'admin_revocations', firebaseUser.uid),
          (snapshot) => {
            if (snapshot.exists()) {
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
    } finally {
      setIsLoading(false);
    }
  }, [verifyAdminClaims]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
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
