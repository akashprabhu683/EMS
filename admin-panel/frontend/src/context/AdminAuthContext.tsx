import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import type { AdminUser } from '../types';

const googleProvider = new GoogleAuthProvider();

interface AdminAuthContextType {
  user: AdminUser | null;
  rawUser: User | null;
  isAdmin: boolean;
  isLoading: boolean;
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

  const verifyAdminClaims = useCallback(async (firebaseUser: User): Promise<boolean> => {
    try {
      // Force refresh token to obtain the latest server-signed custom claims
      let tokenResult = await firebaseUser.getIdTokenResult(true);
      let hasAdminClaim = Boolean(tokenResult.claims.admin);

      // If user does not yet have admin claim, check if they have a pending admin invite to auto-activate
      if (!hasAdminClaim && firebaseUser.email) {
        try {
          const activateFn = httpsCallable<void, { activated: boolean }>(
            functions,
            'checkAndActivatePendingAdmin'
          );
          const res = await activateFn();
          if (res.data?.activated) {
            tokenResult = await firebaseUser.getIdTokenResult(true);
            hasAdminClaim = Boolean(tokenResult.claims.admin);
          }
        } catch (callErr) {
          console.warn('Pending admin invite activation check failed:', callErr);
        }
      }

      setIsAdmin(hasAdminClaim);
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
      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        isAdmin: false,
      });
      return false;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setRawUser(firebaseUser);
      if (firebaseUser) {
        await verifyAdminClaims(firebaseUser);
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setIsLoading(false);
    });

    return unsubscribe;
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
