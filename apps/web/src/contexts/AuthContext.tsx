'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchApi } from '../lib/api';
import WebApp from '@twa-dev/sdk';

export interface User {
  id: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginWithTelegram: (initData: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initTelegramAuth = async () => {
      // Check if running inside Telegram WebApp
      if (typeof window !== 'undefined' && WebApp.initData) {
        WebApp.ready();
        WebApp.expand();
        try {
          const response = await fetchApi('/auth/telegram', {
            method: 'POST',
            body: JSON.stringify({ initData: WebApp.initData }),
          });
          localStorage.setItem('viberoom_token', response.access_token);
          setUser(response.user);
          setLoading(false);
          return;
        } catch (err) {
          console.error('Telegram auto-login failed', err);
        }
      }

      // Fallback to local token if not in Telegram (e.g. testing in browser)
      const token = localStorage.getItem('viberoom_token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const userData = await fetchApi('/auth/me');
        setUser(userData);
      } catch (err) {
        console.error('Failed to restore session:', err);
        localStorage.removeItem('viberoom_token');
      } finally {
        setLoading(false);
      }
    };

    initTelegramAuth();
  }, []);

  const loginWithTelegram = async (initData: string) => {
    try {
      const response = await fetchApi('/auth/telegram', {
        method: 'POST',
        body: JSON.stringify({ initData }),
      });
      localStorage.setItem('viberoom_token', response.access_token);
      setUser(response.user);
    } catch (err) {
      console.error('Telegram login failed', err);
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('viberoom_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithTelegram, logout }}>
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
