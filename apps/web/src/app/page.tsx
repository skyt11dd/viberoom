'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.initDataUnsafe?.start_param) {
        const startParam = tg.initDataUnsafe.start_param;
        if (startParam.startsWith('room_')) {
          const roomId = startParam.replace('room_', '');
          router.push(`/rooms/${roomId}`);
        }
      }
    }
  }, [router]);

  const createRoom = async () => {
    try {
      setCreating(true);
      const room = await fetchApi('/rooms', {
        method: 'POST',
        body: JSON.stringify({ title: `${user?.displayName || 'User'}'s Room` }),
      });
      router.push(`/rooms/${room.id}`);
    } catch (err) {
      console.error('Failed to create room', err);
      setCreating(false);
    }
  };

  if (authLoading) {
    return (
      <div className="glow-bg flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Image src="/logo.jpg" alt="VibeRoom" width={64} height={64} className="rounded-2xl animate-pulse-glow" />
          <p className="text-[var(--text-secondary)] text-sm animate-pulse-glow">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glow-bg flex flex-col h-screen items-center justify-center p-6 relative">
      <div className="glass-card p-10 max-w-sm w-full flex flex-col items-center gap-8 relative z-10">
        {/* Logo */}
        <div className="animate-float">
          <Image 
            src="/logo.jpg" 
            alt="VibeRoom" 
            width={80} 
            height={80} 
            className="rounded-2xl shadow-lg"
            style={{ boxShadow: '0 0 40px rgba(139, 92, 246, 0.3)' }}
          />
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold gradient-text">VibeRoom</h1>
          <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
            Watch videos together with friends<br />in perfect sync
          </p>
        </div>

        {/* Action */}
        {user ? (
          <div className="w-full space-y-4">
            <button 
              onClick={createRoom} 
              disabled={creating}
              className="btn-primary w-full text-base"
            >
              {creating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating...
                </span>
              ) : (
                '✨ Create New Room'
              )}
            </button>
            
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent-violet)] to-[var(--accent-blue)] flex items-center justify-center text-xs font-bold text-white">
                  {user.displayName.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.displayName}</p>
                {user.username && <p className="text-xs text-[var(--text-muted)]">@{user.username}</p>}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--accent-violet)]/10 border border-[var(--accent-violet)]/20">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--accent-violet)]">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-xs text-[var(--accent-violet)] font-medium">Open inside Telegram</span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              This app works as a Telegram Mini App
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="absolute bottom-6 text-xs text-[var(--text-muted)] z-10">
        VibeRoom — watch together, vibe together
      </p>
    </div>
  );
}
