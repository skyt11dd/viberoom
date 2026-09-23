'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, error } = useAuth();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
    if (tg?.initDataUnsafe?.start_param) {
      const sp = tg.initDataUnsafe.start_param;
      if (sp.startsWith('room_')) {
        router.push(`/rooms/${sp.replace('room_', '')}`);
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
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <Image src="/logo.jpg" alt="V" width={56} height={56} style={{ borderRadius: 16, opacity: 0.7 }} />
          <p style={{ color: 'var(--text-hint)', fontSize: 14, marginTop: 16 }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: 'var(--bg)',
      padding: '0 20px',
    }}>
      {/* Main content centered */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        paddingBottom: 40,
      }}>
        {/* Logo */}
        <Image
          src="/logo.jpg"
          alt="VibeRoom"
          width={72}
          height={72}
          style={{ borderRadius: 18 }}
        />

        {/* Title block */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--text)',
            margin: '0 0 8px 0',
          }}>
            VibeRoom
          </h1>
          <p style={{
            fontSize: 15,
            color: 'var(--text-hint)',
            margin: 0,
            lineHeight: 1.5,
          }}>
            Watch videos together with friends
          </p>
        </div>

        {/* Auth section */}
        {user ? (
          <div style={{ width: '100%', maxWidth: 320 }}>
            {/* User info */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 14,
              marginBottom: 16,
            }}>
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} />
              ) : (
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'var(--button)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--button-text)', fontWeight: 600, fontSize: 16,
                }}>
                  {user.displayName.charAt(0)}
                </div>
              )}
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                  {user.displayName}
                </div>
                {user.username && (
                  <div style={{ fontSize: 13, color: 'var(--text-hint)' }}>
                    @{user.username}
                  </div>
                )}
              </div>
            </div>

            {/* Create room button */}
            <button
              onClick={createRoom}
              disabled={creating}
              style={{
                width: '100%',
                padding: '15px 24px',
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--button-text)',
                background: 'var(--button)',
                border: 'none',
                borderRadius: 12,
                cursor: creating ? 'default' : 'pointer',
                opacity: creating ? 0.6 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              {creating ? 'Creating...' : 'Create Room'}
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', maxWidth: 280 }}>
            <p style={{
              fontSize: 14,
              color: 'var(--text-hint)',
              margin: '0 0 8px 0',
              lineHeight: 1.5,
            }}>
              Open this app via Telegram bot to get started
            </p>
            {error && (
              <p style={{
                fontSize: 12,
                color: '#ff6b6b',
                margin: '12px 0 0 0',
                padding: '8px 12px',
                background: 'rgba(255,107,107,0.1)',
                borderRadius: 8,
                wordBreak: 'break-word',
              }}>
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
