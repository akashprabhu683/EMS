import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface WishlistContextType {
  favorites: string[];
  isFavorite: (productId: string) => boolean;
  toggleFavorite: (productId: string) => void;
  clearFavorites: () => void;
  purgeStaleFavorites: (validProductIds: string[]) => void;
  favoritesCount: number;
}

const WishlistContext = createContext<WishlistContextType | null>(null);

const STORAGE_KEY_PREFIX = 'ems_store_favorites_';
// Bump this version whenever the product schema/ID format changes to auto-clear stale favorites
const FAVORITES_SCHEMA_VERSION = '2';
const SCHEMA_VERSION_KEY = 'ems_favorites_schema_v';

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      // Check schema version — clear stale data if version has changed
      const storedVersion = localStorage.getItem(SCHEMA_VERSION_KEY);
      if (storedVersion !== FAVORITES_SCHEMA_VERSION) {
        // Wipe all favorite keys from old schema
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith(STORAGE_KEY_PREFIX)) localStorage.removeItem(k);
        });
        localStorage.setItem(SCHEMA_VERSION_KEY, FAVORITES_SCHEMA_VERSION);
        return [];
      }
      const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}guest`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sync favorites when user logs in or changes
  useEffect(() => {
    let active = true;

    async function loadUserFavorites() {
      if (isAuthenticated && user?.id) {
        const userStorageKey = `${STORAGE_KEY_PREFIX}${user.id}`;
        // Load cached local first
        try {
          const cached = localStorage.getItem(userStorageKey);
          if (cached && active) {
            setFavorites(JSON.parse(cached));
          }
        } catch {
          // ignore
        }

        // Fetch from Firestore
        try {
          const userDocRef = doc(db, 'users', user.id);
          const snap = await getDoc(userDocRef);
          if (snap.exists() && active) {
            const data = snap.data();
            const remoteFavs: string[] = Array.isArray(data.favorites) ? data.favorites : [];
            // Merge local guest favorites if any were added before login
            setFavorites(prev => {
              const combined = Array.from(new Set([...prev, ...remoteFavs]));
              localStorage.setItem(userStorageKey, JSON.stringify(combined));
              return combined;
            });
          }
        } catch (err) {
          console.warn('Could not sync user favorites from Firestore:', err);
        }
      } else {
        // Guest user
        try {
          const guestSaved = localStorage.getItem(`${STORAGE_KEY_PREFIX}guest`);
          if (active) {
            setFavorites(guestSaved ? JSON.parse(guestSaved) : []);
          }
        } catch {
          // ignore
        }
      }
    }

    loadUserFavorites();

    return () => {
      active = false;
    };
  }, [user?.id, isAuthenticated]);

  const toggleFavorite = useCallback((productId: string) => {
    setFavorites(prev => {
      const next = prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId];

      const key = isAuthenticated && user?.id
        ? `${STORAGE_KEY_PREFIX}${user.id}`
        : `${STORAGE_KEY_PREFIX}guest`;

      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch (err) {
        console.warn('Failed to save favorites to localStorage:', err);
      }

      // If authenticated, also persist to Firestore in background
      if (isAuthenticated && user?.id) {
        const userDocRef = doc(db, 'users', user.id);
        setDoc(userDocRef, { favorites: next, updatedAt: new Date().toISOString() }, { merge: true })
          .catch(err => console.warn('Failed to persist favorites to Firestore:', err));
      }

      return next;
    });
  }, [isAuthenticated, user?.id]);

  const purgeStaleFavorites = useCallback((validProductIds: string[]) => {
    if (validProductIds.length === 0) return; // don't purge before products load
    setFavorites(prev => {
      const valid = new Set(validProductIds);
      const next = prev.filter(id => valid.has(id));
      if (next.length === prev.length) return prev; // no change
      const key = isAuthenticated && user?.id
        ? `${STORAGE_KEY_PREFIX}${user.id}`
        : `${STORAGE_KEY_PREFIX}guest`;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch { /* ignore */ }
      if (isAuthenticated && user?.id) {
        const userDocRef = doc(db, 'users', user.id);
        setDoc(userDocRef, { favorites: next, updatedAt: new Date().toISOString() }, { merge: true })
          .catch(console.warn);
      }
      return next;
    });
  }, [isAuthenticated, user?.id]);

  const clearFavorites = useCallback(() => {
    setFavorites([]);
    const key = isAuthenticated && user?.id
      ? `${STORAGE_KEY_PREFIX}${user.id}`
      : `${STORAGE_KEY_PREFIX}guest`;
    localStorage.removeItem(key);
    if (isAuthenticated && user?.id) {
      const userDocRef = doc(db, 'users', user.id);
      setDoc(userDocRef, { favorites: [], updatedAt: new Date().toISOString() }, { merge: true })
        .catch(console.warn);
    }
  }, [isAuthenticated, user?.id]);

  const isFavorite = useCallback((productId: string) => {
    return favorites.includes(productId);
  }, [favorites]);

  return (
    <WishlistContext.Provider
      value={{
        favorites,
        isFavorite,
        toggleFavorite,
        clearFavorites,
        purgeStaleFavorites,
        favoritesCount: favorites.length,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
}
