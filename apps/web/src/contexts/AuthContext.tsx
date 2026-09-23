'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchApi } from '../lib/api';

export interface User {
  id: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  isTelegram: boolean;
  loginWithTelegram: (initData: string) => Promise<void>;
  retryAuth: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTelegram, setIsTelegram] = useState(false);

  const initAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      // Wait a tick for Telegram script to be ready
      await new Promise(r => setTimeout(r, 200));

      const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;

      if (tg) {
        tg.ready();
        tg.expand();
      }

      const initData = tg?.initData;

      if (initData && initData.length > 0) {
        setIsTelegram(true);
        try {
          const response = await fetchApi('/auth/telegram', {
            method: 'POST',
            body: JSON.stringify({ initData }),
          });
          localStorage.setItem('viberoom_token', response.access_token);
          setUser(response.user);
          setError(null);
          setLoading(false);
          return;
        } catch (err: any) {
          console.error('Telegram auth API error:', err);
          setError(`Auth failed: ${err.message}`);
        }
      } else {
        console.log('No Telegram initData found. tg exists:', !!tg, 'initData:', initData);
      }

      // Fallback: try existing token
      const token = localStorage.getItem('viberoom_token');
      if (token) {
        try {
          const userData = await fetchApi('/auth/me');
          setUser(userData);
          setError(null);
          setLoading(false);
          return;
        } catch {
          localStorage.removeItem('viberoom_token');
        }
      }
    } catch (err: any) {
      console.error('Auth init error:', err);
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    initAuth();
  }, []);

  const loginWithTelegram = async (initData: string) => {
    const response = await fetchApi('/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    });
    localStorage.setItem('viberoom_token', response.access_token);
    setUser(response.user);
    setError(null);
  };

  const logout = () => {
    localStorage.removeItem('viberoom_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, isTelegram, loginWithTelegram, retryAuth: initAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
