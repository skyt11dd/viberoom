'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('@twa-dev/sdk').then((module) => {
        const WebApp = module.default;
        if (WebApp.initDataUnsafe?.start_param) {
          const startParam = WebApp.initDataUnsafe.start_param;
          if (startParam.startsWith('room_')) {
            const roomId = startParam.replace('room_', '');
            router.push(`/rooms/${roomId}`);
          }
        }
      });
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
      alert('Failed to create room');
      setCreating(false);
    }
  };

  if (authLoading) return <div className="flex h-screen items-center justify-center bg-neutral-900 text-white">Loading VibeRoom...</div>;

  return (
    <div className="flex flex-col h-screen items-center justify-center bg-neutral-900 text-white p-6 text-center">
      <div className="bg-neutral-800 p-8 rounded-2xl shadow-2xl max-w-sm w-full space-y-6">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">VibeRoom 🎬</h1>
        <p className="text-neutral-400">Watch videos together in perfect sync.</p>
        
        {user ? (
          <button 
            onClick={createRoom} 
            disabled={creating}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition"
          >
            {creating ? 'Creating...' : 'Create New Room'}
          </button>
        ) : (
          <p className="text-red-400">Please open this app inside Telegram.</p>
        )}
      </div>
    </div>
  );
}
