import React, { createContext, useContext, useState, useCallback } from 'react';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Mock auth – will be replaced with Firebase Auth in Phase 2
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const login = useCallback(async (email: string, _password: string) => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 800)); // simulate network
    setUser({
      id: 'u1',
      name: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      email,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(email)}&background=ec4899&color=fff`,
    });
    setIsLoading(false);
  }, []);

  const register = useCallback(async (name: string, email: string, _password: string) => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    setUser({
      id: 'u' + Date.now(),
      name,
      email,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=8b5cf6&color=fff`,
    });
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => setUser(null), []);

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated: !!user, isLoading,
      login, register, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
