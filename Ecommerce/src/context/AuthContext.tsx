import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { User } from '../types';
import { auth, db } from '../firebase';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function mapFirebaseUser(firebaseUser: NonNullable<typeof auth.currentUser>): User {
  return {
    id: firebaseUser.uid,
    name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Customer',
    email: firebaseUser.email || '',
    avatar:
      firebaseUser.photoURL ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(
        firebaseUser.displayName || firebaseUser.email || 'Customer',
      )}&background=8b5cf6&color=fff`,
  };
}

/**
 * Upserts a customer document in Firestore `users/{uid}`.
 * Uses merge:true so existing fields (e.g. savedAddresses) are never overwritten.
 */
async function syncUserDocument(
  firebaseUser: NonNullable<typeof auth.currentUser>,
): Promise<void> {
  try {
    const userRef = doc(db, 'users', firebaseUser.uid);
    await setDoc(
      userRef,
      {
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Customer',
        email: firebaseUser.email || '',
        photoURL: firebaseUser.photoURL || null,
        lastLoginAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    // Non-fatal: log but don't disrupt the user session
    console.warn('[AuthContext] Failed to sync user document:', err);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (firebaseUser) {
          await syncUserDocument(firebaseUser);
          setUser(mapFirebaseUser(firebaseUser));
        } else {
          setUser(null);
        }
        setIsLoading(false);
      },
      () => {
        setUser(null);
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const register = useCallback(async (
    name: string,
    email: string,
    password: string,
  ) => {
    const credential = await createUserWithEmailAndPassword(
      auth,
      email.trim(),
      password,
    );

    try {
      await updateProfile(credential.user, {
        displayName: name.trim(),
      });
      await syncUserDocument({
        ...credential.user,
        displayName: name.trim(),
      } as typeof credential.user);
    } catch (error) {
      await signOut(auth);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}