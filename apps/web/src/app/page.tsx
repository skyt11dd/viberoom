'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

interface ActiveRoom {
  id: string;
  title: string;
  ownerId: string;
  owner?: {
    id: string;
    displayName: string;
    username?: string;
    avatarUrl?: string;
  };
  _count?: {
    members: number;
  };
  members?: any[];
  createdAt: string;
}

interface UserStats {
  roomsCreated: number;
  roomsJoined: number;
}

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, error, isTelegram, retryAuth } = useAuth();

  const [showSplash, setShowSplash] = useState(true);
  const [rooms, setRooms] = useState<ActiveRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);

  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState('');

  // Splash screen timeout (~900ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 900);
    return () => clearTimeout(timer);
  }, []);

  // Handle deep link from Telegram start_param
  useEffect(() => {
    const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
    if (tg?.initDataUnsafe?.start_param) {
      const sp = tg.initDataUnsafe.start_param;
      if (sp.startsWith('room_')) {
        router.push(`/rooms/${sp.replace('room_', '')}`);
      }
    }
  }, [router]);

  // Load public rooms and user stats when user is authenticated
  const loadData = async () => {
    if (!user) return;
    try {
      setLoadingRooms(true);
      const [roomsData, statsData] = await Promise.all([
        fetchApi('/rooms').catch(() => []),
        fetchApi('/rooms/stats/me').catch(() => null),
      ]);
      setRooms(Array.isArray(roomsData) ? roomsData : []);
      if (statsData) setStats(statsData);
    } catch (err) {
      console.error('Error fetching rooms or stats:', err);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const handleCreateRoom = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setCreating(true);
      const title = newRoomTitle.trim() || `Кімната ${user?.displayName || 'користувача'}`;
      const room = await fetchApi('/rooms', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      router.push(`/rooms/${room.id}`);
    } catch (err) {
      console.error('Помилка створення кімнати:', err);
      setCreating(false);
    }
  };

  return (
    <>
      {/* ── Intro Splash Screen ── */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.06, filter: 'blur(10px)' }}
            transition={{ duration: 0.45, ease: 'easeInOut' }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg,#0e0e11)] text-white select-none pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="flex flex-col items-center gap-4"
            >
              <Image
                src="/logo.jpg"
                alt="VIBEROOM"
                width={84}
                height={84}
                className="rounded-2xl shadow-2xl"
                priority
              />
              <div className="text-center">
                <h1 className="text-2xl font-black tracking-widest bg-gradient-to-r from-purple-400 via-violet-300 to-indigo-400 bg-clip-text text-transparent">
                  VIBEROOM
                </h1>
                <p className="text-xs text-white/40 mt-1 font-medium tracking-wide">
                  ДИВИСЬ ВІДЕО РАЗОМ
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main App Content ── */}
      <div className="flex flex-col min-h-[100dvh] bg-[var(--bg,#0e0e11)] text-white select-none">
        {/* Header */}
        <header className="h-14 px-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-[var(--bg,#0e0e11)]/90 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo.jpg"
              alt="V"
              width={30}
              height={30}
              className="rounded-lg shadow-sm"
            />
            <span className="text-base font-extrabold tracking-wider bg-gradient-to-r from-white via-white/90 to-purple-300 bg-clip-text text-transparent">
              VIBEROOM
            </span>
          </div>

          {user && (
            <button
              onClick={() => {
                setNewRoomTitle(`Кімната ${user.displayName}`);
                setShowCreateModal(true);
              }}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--button,#007aff)] text-white hover:opacity-90 active:scale-95 transition flex items-center gap-1 shadow-sm"
            >
              <span>+ Створити</span>
            </button>
          )}
        </header>

        {/* Loading state for auth */}
        {authLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs text-white/50">Авторизація у VIBEROOM...</p>
          </div>
        ) : !user ? (
          /* Not logged in / Auth error state */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <Image
              src="/logo.jpg"
              alt="VIBEROOM"
              width={72}
              height={72}
              className="rounded-2xl mb-4 shadow-xl"
            />
            <h2 className="text-xl font-bold mb-1">VIBEROOM</h2>
            <p className="text-xs text-white/50 max-w-xs mb-6">
              Спільний перегляд відео з друзями в реальному часі та голосовий звʼязок
            </p>

            {error ? (
              <div className="w-full max-w-xs p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center flex flex-col gap-3">
                <p className="text-xs text-red-400 leading-relaxed break-words">{error}</p>
                <button
                  onClick={() => retryAuth()}
                  className="w-full py-2.5 rounded-lg text-xs font-semibold bg-[var(--button,#007aff)] text-white active:scale-95 transition"
                >
                  🔄 Спробувати знову
                </button>
              </div>
            ) : (
              <p className="text-xs text-white/40 bg-white/5 px-4 py-2.5 rounded-xl border border-white/10">
                Відкрийте цей додаток через Telegram-бота для старту
              </p>
            )}
          </div>
        ) : (
          /* Authenticated Dashboard / Rave-style feed */
          <main className="flex-1 flex flex-col p-4 max-w-lg mx-auto w-full pb-10">
            {/* User Profile Card */}
            <div className="p-3.5 rounded-2xl bg-[var(--bg-secondary,#1a1a1e)] border border-white/5 mb-5 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="w-11 h-11 rounded-full object-cover shrink-0 ring-1 ring-white/15"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                    {user.displayName.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    {user.displayName}
                  </div>
                  {user.username && (
                    <div className="text-xs text-white/40 truncate">@{user.username}</div>
                  )}
                </div>
              </div>

              {/* Stats badges */}
              {stats && (
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-center px-2.5 py-1 rounded-xl bg-white/5 border border-white/5">
                    <div className="text-xs font-bold text-purple-300">{stats.roomsCreated}</div>
                    <div className="text-[10px] text-white/40">кімнат</div>
                  </div>
                  <div className="text-center px-2.5 py-1 rounded-xl bg-white/5 border border-white/5">
                    <div className="text-xs font-bold text-emerald-300">{stats.roomsJoined}</div>
                    <div className="text-[10px] text-white/40">переглядів</div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Action: Create Room Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-violet-900/40 border border-purple-500/20 mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white mb-0.5">Власна вечірка</h3>
                <p className="text-[11px] text-white/60">Дивіться будь-яке відео разом з друзями</p>
              </div>
              <button
                onClick={() => {
                  setNewRoomTitle(`Кімната ${user.displayName}`);
                  setShowCreateModal(true);
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white text-black hover:bg-white/90 active:scale-95 transition shrink-0 shadow-md"
              >
                🎉 Створити
              </button>
            </div>

            {/* Public Rooms Header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-white/70">
                  🔥 Активні кімнати
                </span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {rooms.length}
                </span>
              </div>

              <button
                onClick={loadData}
                disabled={loadingRooms}
                className="text-[11px] text-white/50 hover:text-white flex items-center gap-1 active:scale-95 transition"
              >
                <span>{loadingRooms ? 'Оновлення...' : 'Оновити'}</span>
                <span className={loadingRooms ? 'animate-spin' : ''}>🔄</span>
              </button>
            </div>

            {/* Public Rooms List (Rave Style) */}
            {loadingRooms && rooms.length === 0 ? (
              <div className="p-8 text-center text-xs text-white/40">
                Завантаження кімнат...
              </div>
            ) : rooms.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[var(--bg-secondary,#1a1a1e)] border border-white/5 text-center flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl mb-3">
                  🍿
                </div>
                <p className="text-sm font-semibold text-white/80 mb-1">
                  Зараз немає відкритих кімнат
                </p>
                <p className="text-xs text-white/40 max-w-xs mb-4">
                  Будьте першим, хто запустить стрім! Створіть кімнату та запросіть друзів за посиланням.
                </p>
                <button
                  onClick={() => {
                    setNewRoomTitle(`Кімната ${user.displayName}`);
                    setShowCreateModal(true);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--button,#007aff)] text-white active:scale-95 transition shadow-sm"
                >
                  ✨ Створити першу кімнату
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {rooms.map((room) => {
                  const memberCount = room._count?.members ?? room.members?.length ?? 1;

                  return (
                    <div
                      key={room.id}
                      onClick={() => router.push(`/rooms/${room.id}`)}
                      className="p-3.5 rounded-2xl bg-[var(--bg-secondary,#1a1a1e)] hover:bg-[var(--bg-secondary,#1a1a1e)]/80 border border-white/5 active:scale-[0.99] transition cursor-pointer flex items-center justify-between gap-3 shadow-sm group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Host avatar / Icon */}
                        <div className="relative shrink-0">
                          {room.owner?.avatarUrl ? (
                            <img
                              src={room.owner.avatarUrl}
                              alt=""
                              className="w-11 h-11 rounded-xl object-cover ring-1 ring-white/10"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-violet-600/40 to-purple-600/40 border border-purple-500/20 flex items-center justify-center text-base font-bold text-purple-200">
                              {room.owner?.displayName?.charAt(0) || '🎬'}
                            </div>
                          )}
                          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-[var(--bg-secondary,#1a1a1e)] rounded-full animate-pulse" />
                        </div>

                        {/* Room info */}
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-white truncate group-hover:text-purple-300 transition">
                            {room.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-white/50 truncate">
                              Хост: {room.owner?.displayName || 'Анонім'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Action & Member Badge */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          {memberCount}
                        </span>

                        <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 group-hover:bg-[var(--button,#007aff)] group-hover:text-white transition">
                          →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        )}
      </div>

      {/* ── Create Room Modal ── */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              className="w-full max-w-sm rounded-2xl bg-[var(--bg-secondary,#1a1a1e)] border border-white/10 p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white">Створити кімнату</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 text-white/50 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateRoom} className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">
                    Назва кімнати
                  </label>
                  <input
                    type="text"
                    value={newRoomTitle}
                    onChange={(e) => setNewRoomTitle(e.target.value)}
                    placeholder="Наприклад: Вечірній фільм 🍿"
                    className="w-full bg-white/5 border border-white/15 focus:border-[var(--button,#007aff)] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none transition"
                    autoFocus
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/15 text-white transition"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-[var(--button,#007aff)] text-white disabled:opacity-50 active:scale-95 transition shadow-sm"
                  >
                    {creating ? 'Створення...' : 'Запустити'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
