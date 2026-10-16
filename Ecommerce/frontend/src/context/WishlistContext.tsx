import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface WishlistContextType {
  favorites: string[];
  isFavorite: (productId: string) => boolean;
  toggleFavorite: (productId: string) => void;
  favoritesCount: number;
}

const WishlistContext = createContext<WishlistContextType | null>(null);

const STORAGE_KEY_PREFIX = 'ems_store_favorites_';

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
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

  const isFavorite = useCallback((productId: string) => {
    return favorites.includes(productId);
  }, [favorites]);

  return (
    <WishlistContext.Provider
      value={{
        favorites,
        isFavorite,
        toggleFavorite,
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
