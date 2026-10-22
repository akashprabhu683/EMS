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
    let firestoreUnsub: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setRawUser(firebaseUser);
      if (firestoreUnsub) {
        firestoreUnsub();
        firestoreUnsub = null;
      }

      if (firebaseUser) {
        await verifyAdminClaims(firebaseUser);

        // Real-time live listener: If the owner revokes this admin, Firestore /admins/{uid} is deleted.
        // This listener fires instantly without needing page reload!
        firestoreUnsub = onSnapshot(
          doc(db, 'admins', firebaseUser.uid),
          (snapshot) => {
            if (!snapshot.exists()) {
              // Admin document deleted by owner! Revocation is immediate.
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
            console.warn('Real-time admin role listener warning:', error);
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
      if (firestoreUnsub) {
        firestoreUnsub();
      }
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
