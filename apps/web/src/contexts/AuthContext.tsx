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
  loginWithTelegram: (initData: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to get Telegram WebApp instance from the global script
function getTelegramWebApp(): any | null {
  if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
    return (window as any).Telegram.WebApp;
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const tg = getTelegramWebApp();

      // If inside Telegram WebApp and we have initData
      if (tg && tg.initData) {
        tg.ready();
        tg.expand();

        try {
          const response = await fetchApi('/auth/telegram', {
            method: 'POST',
            body: JSON.stringify({ initData: tg.initData }),
          });
          localStorage.setItem('viberoom_token', response.access_token);
          setUser(response.user);
          setLoading(false);
          return;
        } catch (err) {
          console.error('Telegram auto-login failed:', err);
        }
      }

      // Fallback: try existing token
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

    // Small delay to ensure telegram-web-app.js has initialized
    const timer = setTimeout(initAuth, 100);
    return () => clearTimeout(timer);
  }, []);

  const loginWithTelegram = async (initData: string) => {
    const response = await fetchApi('/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    });
    localStorage.setItem('viberoom_token', response.access_token);
    setUser(response.user);
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
