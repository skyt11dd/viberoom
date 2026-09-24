'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchApi } from '../lib/api';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';

interface Room {
  id: string;
  title: string;
  privacy: string;
  ownerId: string;
  owner: {
    id: string;
    displayName: string;
    username?: string;
    avatarUrl?: string;
  };
  members?: any[];
  _count?: {
    members: number;
  };
  createdAt: string;
}

interface UserStats {
  roomsCreated: number;
  roomsJoined: number;
}

interface Friend {
  id: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  currentRoom?: {
    id: string;
    title: string;
  } | null;
}

export default function Home() {
  const { user, loading: authLoading, error, retryAuth } = useAuth();
  const router = useRouter();

  // Intro Splash State
  const [showSplash, setShowSplash] = useState(true);

  // Tabs: 'rooms' | 'friends'
  const [mainTab, setMainTab] = useState<'rooms' | 'friends'>('rooms');

  // Rooms list state
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // User stats state
  const [stats, setStats] = useState<UserStats | null>(null);

  // Friends state
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  // Create room modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [creating, setCreating] = useState(false);

  // Trigger haptic feedback when inside Telegram WebApp
  const triggerHaptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
    if (typeof window !== 'undefined') {
      const tg = (window as any).Telegram?.WebApp;
      tg?.HapticFeedback?.impactOccurred?.(type);
    }
  };

  // Handle intro splash screen (quick, smooth 1.0s display)
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Fetch rooms feed & user stats
  const loadData = async () => {
    try {
      setLoadingRooms(true);
      const [roomsData, statsData, friendsData] = await Promise.all([
        fetchApi('/rooms').catch(() => []),
        fetchApi('/rooms/stats/me').catch(() => null),
        fetchApi('/friends').catch(() => []),
      ]);
      setRooms(Array.isArray(roomsData) ? roomsData : []);
      if (statsData) setStats(statsData);
      if (Array.isArray(friendsData)) setFriends(friendsData);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadFriends = async () => {
    try {
      setLoadingFriends(true);
      const data = await fetchApi('/friends');
      if (Array.isArray(data)) setFriends(data);
    } catch (err) {
      console.error('Failed to load friends:', err);
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    triggerHaptic('medium');
    try {
      await fetchApi(`/friends/${friendId}`, { method: 'DELETE' });
      setFriends((prev) => prev.filter((f) => f.id !== friendId));
    } catch (err) {
      console.error('Failed to remove friend:', err);
    }
  };

  const handleCreateRoom = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    triggerHaptic('medium');
    try {
      setCreating(true);
      const title = newRoomTitle.trim() || `Кімната ${user?.displayName || 'користувача'}`;
      const room = await fetchApi('/rooms', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      if (room && room.id) {
        setRooms((prev) => [room, ...prev]);
        setShowCreateModal(false);
        setNewRoomTitle('');
        router.push(`/rooms/${room.id}`);
      }
    } catch (err: any) {
      console.error('Помилка створення кімнати:', err);
      alert(err.message || 'Не вдалося створити кімнату. Спробуйте ще раз.');
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
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(16px)' }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#12141f] text-white select-none pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-4"
            >
              <Image
                src="/logo.jpg"
                alt="VIBEROOM"
                width={88}
                height={88}
                className="rounded-[24px] shadow-2xl ring-1 ring-white/10"
                priority
              />
              <div className="text-center">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  VIBEROOM
                </h1>
                <p className="text-[11px] text-white/40 mt-1 font-medium tracking-widest uppercase">
                  Дивись разом
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main App Content ── */}
      <div className="flex flex-col min-h-[100dvh] bg-[#12141f] text-white select-none relative overflow-x-hidden">
        {/* Subtle Ambient Top Blur */}
        <div
          className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[340px] h-[180px] bg-indigo-500/15 rounded-full blur-[100px] z-0"
          aria-hidden="true"
        />



        {/* Loading state for auth */}
        {authLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10 pt-[max(64px,calc(env(safe-area-inset-top)+20px))]">
            <div className="w-7 h-7 border-2 border-white/20 border-t-white rounded-full animate-spin mb-3" />
            <p className="text-xs text-white/40 font-medium">Підключення до VIBEROOM...</p>
          </div>
        ) : !user ? (
          /* Not logged in / Auth error state */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10 max-w-sm mx-auto pt-[max(64px,calc(env(safe-area-inset-top)+20px))]">
            <Image
              src="/logo.jpg"
              alt="VIBEROOM"
              width={76}
              height={76}
              className="rounded-[22px] mb-4 shadow-2xl ring-1 ring-white/15"
            />
            <h2 className="text-xl font-bold tracking-tight mb-1 text-white">VIBEROOM</h2>
            <p className="text-xs text-white/50 leading-relaxed mb-6">
              Синхронний перегляд відео з друзями та живий голосовий звʼязок
            </p>

            {error ? (
              <div className="w-full p-4 rounded-[20px] ios-glass border-red-500/20 text-center flex flex-col gap-3">
                <p className="text-xs text-red-400 leading-relaxed break-words">{error}</p>
                <button
                  onClick={() => retryAuth()}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold bg-white text-black active:scale-95 transition shadow-sm"
                >
                  Спробувати знову
                </button>
              </div>
            ) : (
              <div className="px-5 py-3 rounded-2xl ios-glass text-xs text-white/50">
                Відкрийте цей додаток через Telegram-бота для старту
              </div>
            )}
          </div>
        ) : (
          /* Authenticated Dashboard */
          <main className="flex-1 flex flex-col p-4 max-w-md mx-auto w-full pt-[max(64px,calc(env(safe-area-inset-top)+20px))] pb-28 z-10">
            {/* User Profile Card (iOS Squircle Style) */}
            <div className="p-3.5 rounded-[22px] ios-glass mb-4 flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="w-11 h-11 rounded-[16px] object-cover shrink-0 ring-1 ring-white/15"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-[16px] bg-white/10 text-white flex items-center justify-center text-sm font-semibold shrink-0 ring-1 ring-white/10">
                    {user.displayName.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-white truncate leading-tight">
                    {user.displayName}
                  </div>
                  {user.username && (
                    <div className="text-xs text-white/40 truncate mt-0.5 font-normal">
                      @{user.username}
                    </div>
                  )}
                </div>
              </div>

              {/* Minimalist Stats Capsules */}
              {stats && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.06] text-center">
                    <span className="text-xs font-semibold text-white">{stats.roomsCreated}</span>
                    <span className="text-[10px] text-white/40 ml-1">створено</span>
                  </div>
                  <div className="px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.06] text-center">
                    <span className="text-xs font-semibold text-emerald-400">{stats.roomsJoined}</span>
                    <span className="text-[10px] text-white/40 ml-1">участь</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Action: Minimalist Frosted Banner */}
            <div className="p-4 rounded-[22px] ios-glass-elevated mb-5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white tracking-tight">Нова кімната</h3>
                <p className="text-xs text-white/50 truncate mt-0.5">Дивіться відео разом з друзями</p>
              </div>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setNewRoomTitle(`Кімната ${user.displayName}`);
                  setShowCreateModal(true);
                }}
                className="px-4 py-2 rounded-full text-xs font-semibold bg-white text-black active:scale-95 transition shrink-0 shadow-md"
              >
                Почати
              </button>
            </div>

            {/* ── iOS Segmented Control Pill Bar ── */}
            <div className="p-1 rounded-full bg-white/[0.06] border border-white/[0.06] flex gap-1 mb-4 backdrop-blur-xl">
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setMainTab('rooms');
                }}
                className={`flex-1 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                  mainTab === 'rooms'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                Кімнати ({rooms.length})
              </button>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setMainTab('friends');
                  loadFriends();
                }}
                className={`flex-1 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                  mainTab === 'friends'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                Друзі ({friends.length})
              </button>
            </div>

            {/* ── Tab 1: Rooms Feed ── */}
            {mainTab === 'rooms' && (
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    Активні вечірки
                  </span>
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      loadData();
                    }}
                    disabled={loadingRooms}
                    className="text-xs text-white/50 hover:text-white flex items-center gap-1 active:scale-95 transition"
                  >
                    <span>{loadingRooms ? 'Оновлення...' : 'Оновити'}</span>
                  </button>
                </div>

                {loadingRooms && rooms.length === 0 ? (
                  <div className="p-10 text-center text-xs text-white/40 font-medium">
                    Завантаження кімнат...
                  </div>
                ) : rooms.length === 0 ? (
                  /* Empty state */
                  <div className="p-8 rounded-[24px] ios-glass text-center flex flex-col items-center">
                    <div className="w-12 h-12 rounded-[16px] bg-white/[0.06] border border-white/10 flex items-center justify-center text-xl mb-3">
                      🎬
                    </div>
                    <p className="text-sm font-semibold text-white mb-1">
                      Немає активних кімнат
                    </p>
                    <p className="text-xs text-white/40 max-w-xs leading-relaxed mb-4">
                      Створіть першу кімнату та запросіть друзів приєднатися до перегляду!
                    </p>
                    <button
                      onClick={() => {
                        triggerHaptic('light');
                        setNewRoomTitle(`Кімната ${user.displayName}`);
                        setShowCreateModal(true);
                      }}
                      className="px-4 py-2 rounded-full text-xs font-semibold bg-white text-black active:scale-95 transition shadow-sm"
                    >
                      Створити кімнату
                    </button>
                  </div>
                ) : (
                  /* Rooms list */
                  <div className="space-y-2">
                    {rooms.map((room) => {
                      const memberCount = room._count?.members ?? room.members?.length ?? 1;

                      return (
                        <div
                          key={room.id}
                          onClick={() => {
                            triggerHaptic('light');
                            router.push(`/rooms/${room.id}`);
                          }}
                          className="p-3 rounded-[20px] ios-glass hover:bg-white/[0.07] active:scale-[0.99] transition cursor-pointer flex items-center justify-between gap-3 shadow-sm group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative shrink-0">
                              {room.owner?.avatarUrl ? (
                                <img
                                  src={room.owner.avatarUrl}
                                  alt=""
                                  className="w-11 h-11 rounded-[14px] object-cover ring-1 ring-white/10"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-[14px] bg-white/10 text-white flex items-center justify-center text-sm font-semibold ring-1 ring-white/10">
                                  {room.owner?.displayName?.charAt(0) || '🎬'}
                                </div>
                              )}
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-black rounded-full" />
                            </div>

                            <div className="min-w-0">
                              <h4 className="text-[14px] font-semibold text-white truncate leading-tight group-hover:text-white/90">
                                {room.title}
                              </h4>
                              <p className="text-xs text-white/40 truncate mt-0.5">
                                Хост: {room.owner?.displayName || 'Анонім'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/[0.08] text-white/80 border border-white/[0.08] flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              <span>{memberCount}</span>
                            </span>
                            <span className="text-white/30 text-lg leading-none font-light group-hover:text-white transition">
                              ›
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab 2: Friends List ── */}
            {mainTab === 'friends' && (
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    Ваші друзі
                  </span>
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      loadFriends();
                    }}
                    disabled={loadingFriends}
                    className="text-xs text-white/50 hover:text-white flex items-center gap-1 active:scale-95 transition"
                  >
                    <span>{loadingFriends ? 'Оновлення...' : 'Оновити'}</span>
                  </button>
                </div>

                {loadingFriends && friends.length === 0 ? (
                  <div className="p-10 text-center text-xs text-white/40 font-medium">
                    Завантаження друзів...
                  </div>
                ) : friends.length === 0 ? (
                  <div className="p-8 rounded-[24px] ios-glass text-center flex flex-col items-center">
                    <div className="w-12 h-12 rounded-[16px] bg-white/[0.06] border border-white/10 flex items-center justify-center text-xl mb-3">
                      👥
                    </div>
                    <p className="text-sm font-semibold text-white mb-1">
                      У вас поки немає друзів
                    </p>
                    <p className="text-xs text-white/40 max-w-xs leading-relaxed">
                      Заходьте в кімнати та натискайте на учасників, щоб додати їх у друзі й кликати одним дотиком.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {friends.map((friend) => (
                      <div
                        key={friend.id}
                        className="p-3 rounded-[20px] ios-glass flex items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {friend.avatarUrl ? (
                            <img
                              src={friend.avatarUrl}
                              alt=""
                              className="w-10 h-10 rounded-[14px] object-cover ring-1 ring-white/10 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-[14px] bg-white/10 text-white flex items-center justify-center text-xs font-semibold shrink-0 ring-1 ring-white/10">
                              {friend.displayName.charAt(0)}
                            </div>
                          )}

                          <div className="min-w-0">
                            <h4 className="text-[13px] font-semibold text-white truncate leading-tight">
                              {friend.displayName}
                            </h4>
                            {friend.username && (
                              <p className="text-xs text-white/40 truncate mt-0.5 font-normal">
                                @{friend.username}
                              </p>
                            )}
                            {friend.currentRoom && (
                              <p className="text-[11px] text-indigo-300 truncate mt-0.5">
                                У кімнаті: {friend.currentRoom.title}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {friend.currentRoom && (
                            <button
                              onClick={() => {
                                triggerHaptic('light');
                                router.push(`/rooms/${friend.currentRoom!.id}`);
                              }}
                              className="px-3 py-1 rounded-full text-xs font-semibold bg-white text-black active:scale-95 transition"
                            >
                              Зайти
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveFriend(friend.id)}
                            className="w-7 h-7 rounded-full text-white/30 hover:text-red-400 flex items-center justify-center text-xs transition"
                            title="Видалити з друзів"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </main>
        )}

        {/* ── Bottom Floating Dock: VIBEROOM Logo + Create Button ── */}
        {user && (
          <div className="fixed bottom-0 left-0 right-0 z-30 p-3 pb-[max(14px,env(safe-area-inset-bottom))] pointer-events-none">
            <div className="max-w-md mx-auto ios-glass-elevated rounded-[24px] px-4 py-2.5 flex items-center justify-between pointer-events-auto shadow-2xl border border-white/15">
              {/* Left: VIBEROOM Logo & Branding */}
              <div className="flex items-center gap-2.5">
                <Image
                  src="/logo.jpg"
                  alt="VIBEROOM"
                  width={32}
                  height={32}
                  className="rounded-[10px] ring-1 ring-white/15 shadow-sm"
                />
                <div>
                  <span className="text-[14px] font-bold tracking-tight text-white block leading-tight">
                    VIBEROOM
                  </span>
                  <span className="text-[10px] text-white/45 font-medium tracking-wider uppercase block">
                    mini app
                  </span>
                </div>
              </div>

              {/* Right: + Створити Button */}
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setNewRoomTitle(`Кімната ${user.displayName}`);
                  setShowCreateModal(true);
                }}
                className="px-4 py-2 rounded-full text-xs font-bold bg-white text-black hover:bg-white/90 active:scale-95 transition shadow-md flex items-center gap-1.5"
              >
                <span className="text-base font-black leading-none">+</span>
                <span>Створити</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Native iOS Bottom Sheet: Create Room Modal ── */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-sm rounded-t-[32px] sm:rounded-[28px] ios-glass-elevated p-6 shadow-2xl border border-white/10"
            >
              {/* iOS Grabber */}
              <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto mb-5 sm:hidden" />

              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white tracking-tight">Нова кімната</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="w-7 h-7 rounded-full bg-white/10 text-white/50 hover:text-white flex items-center justify-center text-xs transition"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateRoom} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">
                    Назва кімнати
                  </label>
                  <input
                    type="text"
                    value={newRoomTitle}
                    onChange={(e) => setNewRoomTitle(e.target.value)}
                    placeholder="Наприклад: Вечірнє кіно 🍿"
                    className="w-full bg-white/[0.06] border border-white/10 focus:border-white/30 rounded-2xl px-4 py-3 text-[14px] text-white placeholder-white/30 focus:outline-none transition"
                    autoFocus
                  />
                </div>

                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-3 rounded-2xl text-xs font-medium bg-white/10 text-white/80 hover:bg-white/15 transition active:scale-95"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 py-3 rounded-2xl text-xs font-semibold bg-white text-black disabled:opacity-50 active:scale-95 transition shadow-lg"
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
