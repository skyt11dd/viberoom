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

interface FriendRequestItem {
  id: string;
  sender?: {
    id: string;
    displayName: string;
    username?: string;
    avatarUrl?: string;
  };
  receiver?: {
    id: string;
    displayName: string;
    username?: string;
    avatarUrl?: string;
  };
  createdAt: string;
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
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestItem[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestItem[]>([]);
  const [showOutgoing, setShowOutgoing] = useState(false);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

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

  // Fetch rooms feed & user stats & friends/requests
  const loadData = async () => {
    try {
      setLoadingRooms(true);
      const [roomsData, statsData, friendsData, requestsData] = await Promise.all([
        fetchApi('/rooms').catch(() => []),
        fetchApi('/rooms/stats/me').catch(() => null),
        fetchApi('/friends').catch(() => []),
        fetchApi('/friends/requests').catch(() => ({ incoming: [], outgoing: [] })),
      ]);
      setRooms(Array.isArray(roomsData) ? roomsData : []);
      if (statsData) setStats(statsData);
      if (Array.isArray(friendsData)) setFriends(friendsData);
      if (requestsData?.incoming) setIncomingRequests(requestsData.incoming);
      if (requestsData?.outgoing) setOutgoingRequests(requestsData.outgoing);
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
      const [data, requestsData] = await Promise.all([
        fetchApi('/friends').catch(() => []),
        fetchApi('/friends/requests').catch(() => ({ incoming: [], outgoing: [] })),
      ]);
      if (Array.isArray(data)) setFriends(data);
      if (requestsData?.incoming) setIncomingRequests(requestsData.incoming);
      if (requestsData?.outgoing) setOutgoingRequests(requestsData.outgoing);
    } catch (err) {
      console.error('Failed to load friends:', err);
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    triggerHaptic('medium');
    setActionLoadingId(requestId);
    try {
      await fetchApi(`/friends/requests/${requestId}/accept`, { method: 'POST' });
      await loadFriends();
    } catch (err) {
      console.error('Failed to accept request:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    triggerHaptic('light');
    setActionLoadingId(requestId);
    try {
      await fetchApi(`/friends/requests/${requestId}/decline`, { method: 'POST' });
      setIncomingRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      console.error('Failed to decline request:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    triggerHaptic('light');
    setActionLoadingId(requestId);
    try {
      await fetchApi(`/friends/requests/${requestId}/cancel`, { method: 'POST' });
      setOutgoingRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      console.error('Failed to cancel request:', err);
    } finally {
      setActionLoadingId(null);
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
        {/* Multi-layered Subtle Ambient Glow */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
          <div className="absolute -top-16 left-1/4 w-[380px] h-[260px] bg-indigo-600/12 rounded-full blur-[130px]" />
          <div className="absolute top-32 -right-10 w-[300px] h-[240px] bg-purple-600/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-10 left-1/3 w-[400px] h-[280px] bg-blue-600/6 rounded-full blur-[140px]" />
        </div>

        {/* ── Top Header with dedicated spacer for Telegram floating controls ── */}
        <header className="px-4 pb-3 ios-glass-header flex flex-col shrink-0 sticky top-0 z-20">
          {/* Hardware & Telegram floating controls spacer */}
          <div
            style={{
              height: 'calc(env(safe-area-inset-top, 47px) + 58px)',
              minHeight: '110px',
            }}
            className="w-full shrink-0"
            aria-hidden="true"
          />

          {/* Header row: Logo + Create Button */}
          <div className="flex items-center justify-between w-full">
            <motion.div
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2.5 cursor-pointer select-none"
            >
              <div className="relative">
                <Image
                  src="/logo.jpg"
                  alt="VIBEROOM"
                  width={28}
                  height={28}
                  className="rounded-[9px] ring-1 ring-white/15 shadow-md object-cover"
                />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <span className="text-[15px] font-bold tracking-tight text-white">
                VIBEROOM
              </span>
            </motion.div>

            {user && (
              <motion.button
                whileTap={{ scale: 0.93 }}
                whileHover={{ scale: 1.03 }}
                onClick={() => {
                  triggerHaptic('light');
                  setNewRoomTitle(`Кімната ${user.displayName}`);
                  setShowCreateModal(true);
                }}
                className="px-4 py-2 rounded-full text-xs font-bold bg-white text-black hover:bg-white/95 active:scale-95 transition shadow-[0_2px_12px_rgba(255,255,255,0.2)] flex items-center gap-1.5"
              >
                <span className="text-sm font-black leading-none">+</span>
                <span>Створити</span>
              </motion.button>
            )}
          </div>
        </header>

        {/* Loading state for auth */}
        {authLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10">
            <div className="w-7 h-7 border-2 border-white/20 border-t-white rounded-full animate-spin mb-3" />
            <p className="text-xs text-white/40 font-medium">Підключення до VIBEROOM...</p>
          </div>
        ) : !user ? (
          /* Not logged in / Auth error state */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10 max-w-sm mx-auto">
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
          <main className="flex-1 flex flex-col p-4 max-w-md mx-auto w-full pb-16 z-10">
            {/* User Profile Card (iOS Squircle Style) */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="p-3.5 rounded-[22px] ios-glass mb-4 flex items-center justify-between gap-3 shadow-sm relative overflow-hidden"
            >
              <div className="flex items-center gap-3 min-w-0">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="w-11 h-11 rounded-[16px] object-cover shrink-0 ring-1 ring-white/15 shadow-sm"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-[16px] bg-gradient-to-br from-white/15 to-white/5 text-white flex items-center justify-center text-sm font-bold shrink-0 ring-1 ring-white/15 shadow-sm">
                    {user.displayName.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-white truncate leading-tight">
                    {user.displayName}
                  </div>
                  {user.username && (
                    <div className="text-xs text-white/50 truncate mt-0.5 font-normal">
                      @{user.username}
                    </div>
                  )}
                </div>
              </div>

              {/* Minimalist Stats Capsules */}
              {stats && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="px-2.5 py-1.5 rounded-full bg-white/[0.07] border border-white/[0.08] text-center shadow-inner">
                    <span className="text-xs font-bold text-white">{stats.roomsCreated}</span>
                    <span className="text-[10px] text-white/45 ml-1 font-medium">створено</span>
                  </div>
                  <div className="px-2.5 py-1.5 rounded-full bg-white/[0.07] border border-white/[0.08] text-center shadow-inner">
                    <span className="text-xs font-bold text-emerald-400">{stats.roomsJoined}</span>
                    <span className="text-[10px] text-white/45 ml-1 font-medium">участь</span>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Quick Action: Minimalist Frosted Banner with Glowing Accent */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.38, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="p-4 rounded-[22px] ios-glass-elevated mb-5 flex items-center justify-between gap-3 relative overflow-hidden group shadow-md"
            >
              {/* Subtle violet ambient accent inside card */}
              <div className="absolute -top-10 -left-10 w-24 h-24 bg-purple-500/15 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-center gap-3 min-w-0 z-10">
                <div className="w-10 h-10 rounded-[14px] bg-gradient-to-br from-purple-500/20 to-indigo-500/30 border border-purple-400/25 flex items-center justify-center text-lg shrink-0 shadow-sm">
                  ✨
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white tracking-tight leading-tight">Нова кімната</h3>
                  <p className="text-xs text-white/50 truncate mt-0.5">Дивіться відео разом з друзями</p>
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.94 }}
                whileHover={{ scale: 1.03 }}
                onClick={() => {
                  triggerHaptic('light');
                  setNewRoomTitle(`Кімната ${user.displayName}`);
                  setShowCreateModal(true);
                }}
                className="px-4 py-2 rounded-full text-xs font-bold bg-white text-black active:scale-95 transition shrink-0 shadow-md z-10"
              >
                Почати
              </motion.button>
            </motion.div>

            {/* ── iOS Segmented Control Pill Bar with Spring Slide ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.38, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="p-1 rounded-full bg-white/[0.06] border border-white/[0.08] flex gap-1 mb-4 backdrop-blur-xl relative"
            >
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setMainTab('rooms');
                }}
                className="flex-1 py-1.5 rounded-full text-xs font-semibold relative transition text-center select-none"
              >
                {mainTab === 'rooms' && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    className="absolute inset-0 bg-white rounded-full shadow-sm z-0"
                  />
                )}
                <span className={`relative z-10 font-bold transition-colors ${mainTab === 'rooms' ? 'text-black' : 'text-white/60 hover:text-white'}`}>
                  Кімнати ({rooms.length})
                </span>
              </button>

              <button
                onClick={() => {
                  triggerHaptic('light');
                  setMainTab('friends');
                  loadFriends();
                }}
                className="flex-1 py-1.5 rounded-full text-xs font-semibold relative transition text-center select-none"
              >
                {mainTab === 'friends' && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    className="absolute inset-0 bg-white rounded-full shadow-sm z-0"
                  />
                )}
                <span className={`relative z-10 font-bold transition-colors ${mainTab === 'friends' ? 'text-black' : 'text-white/60 hover:text-white'} flex items-center justify-center gap-1.5`}>
                  <span>Друзі ({friends.length})</span>
                  {incomingRequests.length > 0 && (
                    <span className="w-2 h-2 rounded-full bg-purple-500 ring-2 ring-purple-400/40 animate-pulse" />
                  )}
                </span>
              </button>
            </motion.div>

            {/* ── Tab Content with Liquid Crossfade Animation ── */}
            <AnimatePresence mode="wait">
              {mainTab === 'rooms' ? (
                <motion.div
                  key="rooms-tab"
                  initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(3px)' }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
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
                      className="text-xs text-white/50 hover:text-white flex items-center gap-1.5 active:scale-95 transition"
                    >
                      <span className={loadingRooms ? 'animate-spin inline-block' : ''}>🔄</span>
                      <span>{loadingRooms ? 'Оновлення...' : 'Оновити'}</span>
                    </button>
                  </div>

                  {loadingRooms && rooms.length === 0 ? (
                    <div className="p-12 text-center text-xs text-white/40 font-medium flex flex-col items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Завантаження кімнат...</span>
                    </div>
                  ) : rooms.length === 0 ? (
                    /* Empty state with Floating Clapper & Ambient Glow */
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className="p-8 rounded-[26px] ios-glass text-center flex flex-col items-center relative overflow-hidden"
                    >
                      <div className="relative mb-3 flex items-center justify-center">
                        <div className="absolute w-16 h-16 bg-purple-500/20 rounded-full blur-xl animate-pulse" />
                        <motion.div
                          animate={{ y: [0, -6, 0], rotate: [0, -2, 2, 0] }}
                          transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut' }}
                          className="w-14 h-14 rounded-[18px] bg-white/[0.08] border border-white/15 flex items-center justify-center text-2xl shadow-lg relative z-10"
                        >
                          🎬
                        </motion.div>
                      </div>

                      <p className="text-[15px] font-bold text-white mb-1.5 tracking-tight">
                        Немає активних кімнат
                      </p>
                      <p className="text-xs text-white/45 max-w-xs leading-relaxed mb-5 font-normal">
                        Створіть першу кімнату та запросіть друзів приєднатися до перегляду!
                      </p>

                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => {
                          triggerHaptic('light');
                          setNewRoomTitle(`Кімната ${user.displayName}`);
                          setShowCreateModal(true);
                        }}
                        className="px-5 py-2.5 rounded-full text-xs font-bold bg-white text-black active:scale-95 transition shadow-[0_4px_16px_rgba(255,255,255,0.22)]"
                      >
                        Створити кімнату
                      </motion.button>
                    </motion.div>
                  ) : (
                    /* Rooms list with animated staggered cards */
                    <div className="space-y-2.5">
                      {rooms.map((room, index) => {
                        const memberCount = room._count?.members ?? room.members?.length ?? 1;

                        return (
                          <motion.div
                            key={room.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.28, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
                            whileHover={{ scale: 1.012, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              triggerHaptic('light');
                              router.push(`/rooms/${room.id}`);
                            }}
                            className="p-3.5 rounded-[22px] ios-glass hover:bg-white/[0.09] active:bg-white/[0.12] transition cursor-pointer flex items-center justify-between gap-3 shadow-sm group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative shrink-0">
                                {room.owner?.avatarUrl ? (
                                  <img
                                    src={room.owner.avatarUrl}
                                    alt=""
                                    className="w-11 h-11 rounded-[15px] object-cover ring-1 ring-white/15"
                                  />
                                ) : (
                                  <div className="w-11 h-11 rounded-[15px] bg-gradient-to-br from-indigo-500/20 to-purple-500/30 text-white flex items-center justify-center text-sm font-bold ring-1 ring-white/15">
                                    {room.owner?.displayName?.charAt(0) || '🎬'}
                                  </div>
                                )}
                                <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-[#12141f]" />
                                </span>
                              </div>

                              <div className="min-w-0">
                                <h4 className="text-[14px] font-bold text-white truncate leading-tight group-hover:text-white">
                                  {room.title}
                                </h4>
                                <p className="text-xs text-white/45 truncate mt-0.5 font-normal">
                                  Хост: {room.owner?.displayName || 'Анонім'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/[0.08] text-white/90 border border-white/[0.08] flex items-center gap-1.5 shadow-inner">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span>{memberCount}</span>
                              </span>
                              <span className="text-white/30 text-lg leading-none font-light group-hover:text-white transition">
                                ›
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              ) : (
                /* ── Tab 2: Friends List with Liquid Transition ── */
                <motion.div
                  key="friends-tab"
                  initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(3px)' }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
                  {/* Incoming Requests Section (Needs Attention) */}
                  {incomingRequests.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-4 p-3.5 rounded-[22px] bg-gradient-to-br from-purple-500/20 via-indigo-500/15 to-transparent border border-purple-400/30 backdrop-blur-xl shadow-lg relative overflow-hidden"
                    >
                      <div className="flex items-center justify-between mb-3 px-0.5">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-400" />
                          </span>
                          <span className="text-xs font-bold text-white tracking-tight">
                            Вхідні заявки ({incomingRequests.length})
                          </span>
                        </div>
                        <span className="text-[10px] text-purple-200/60 font-medium">Нові запити</span>
                      </div>

                      <div className="space-y-2">
                        {incomingRequests.map((req) => (
                          <div
                            key={req.id}
                            className="p-2.5 rounded-[16px] bg-white/[0.08] border border-white/10 flex items-center justify-between gap-2.5 shadow-sm"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {req.sender?.avatarUrl ? (
                                <img
                                  src={req.sender.avatarUrl}
                                  alt=""
                                  className="w-10 h-10 rounded-[13px] object-cover ring-1 ring-white/15 shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-[13px] bg-gradient-to-br from-purple-500/30 to-indigo-500/40 text-white flex items-center justify-center text-xs font-bold shrink-0 ring-1 ring-white/15">
                                  {req.sender?.displayName?.charAt(0) || '👤'}
                                </div>
                              )}
                              <div className="min-w-0">
                                <h4 className="text-[13px] font-bold text-white truncate leading-tight">
                                  {req.sender?.displayName}
                                </h4>
                                {req.sender?.username && (
                                  <p className="text-[11px] text-white/45 truncate mt-0.5">
                                    @{req.sender.username}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <motion.button
                                whileTap={{ scale: 0.92 }}
                                disabled={actionLoadingId === req.id}
                                onClick={() => handleAcceptRequest(req.id)}
                                className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-white text-black active:scale-95 transition shadow-sm disabled:opacity-50"
                              >
                                {actionLoadingId === req.id ? '...' : 'Прийняти'}
                              </motion.button>
                              <motion.button
                                whileTap={{ scale: 0.88 }}
                                disabled={actionLoadingId === req.id}
                                onClick={() => handleDeclineRequest(req.id)}
                                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/15 text-white/50 hover:text-white flex items-center justify-center text-xs transition disabled:opacity-50"
                                title="Відхилити"
                              >
                                ✕
                              </motion.button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Outgoing Requests Section (Collapsible) */}
                  {outgoingRequests.length > 0 && (
                    <div className="mb-4 px-1">
                      <button
                        onClick={() => setShowOutgoing(!showOutgoing)}
                        className="text-xs text-white/45 hover:text-white/80 flex items-center gap-1.5 transition select-none"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <span>Надіслані заявки ({outgoingRequests.length})</span>
                        <span className="text-[10px] text-white/30">{showOutgoing ? '▲' : '▼'}</span>
                      </button>

                      {showOutgoing && (
                        <div className="mt-2 space-y-1.5">
                          {outgoingRequests.map((req) => (
                            <div
                              key={req.id}
                              className="p-2.5 rounded-[16px] ios-glass flex items-center justify-between gap-2.5 text-xs shadow-sm"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-white/40">⏳</span>
                                <span className="text-white font-medium truncate">{req.receiver?.displayName}</span>
                                <span className="text-[11px] text-white/40 truncate">Очікує прийняття</span>
                              </div>
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                disabled={actionLoadingId === req.id}
                                onClick={() => handleCancelRequest(req.id)}
                                className="text-[11px] text-white/40 hover:text-red-400 transition px-2 py-0.5 rounded-full hover:bg-white/5"
                              >
                                Скасувати
                              </motion.button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                      Ваші друзі ({friends.length})
                    </span>
                    <button
                      onClick={() => {
                        triggerHaptic('light');
                        loadFriends();
                      }}
                      disabled={loadingFriends}
                      className="text-xs text-white/50 hover:text-white flex items-center gap-1.5 active:scale-95 transition"
                    >
                      <span className={loadingFriends ? 'animate-spin inline-block' : ''}>🔄</span>
                      <span>{loadingFriends ? 'Оновлення...' : 'Оновити'}</span>
                    </button>
                  </div>

                  {loadingFriends && friends.length === 0 ? (
                    <div className="p-12 text-center text-xs text-white/40 font-medium flex flex-col items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Завантаження друзів...</span>
                    </div>
                  ) : friends.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className="p-8 rounded-[26px] ios-glass text-center flex flex-col items-center relative overflow-hidden"
                    >
                      <div className="relative mb-3 flex items-center justify-center">
                        <div className="absolute w-16 h-16 bg-blue-500/20 rounded-full blur-xl animate-pulse" />
                        <motion.div
                          animate={{ y: [0, -6, 0] }}
                          transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut' }}
                          className="w-14 h-14 rounded-[18px] bg-white/[0.08] border border-white/15 flex items-center justify-center text-2xl shadow-lg relative z-10"
                        >
                          👥
                        </motion.div>
                      </div>

                      <p className="text-[15px] font-bold text-white mb-1.5 tracking-tight">
                        У вас поки немає друзів
                      </p>
                      <p className="text-xs text-white/45 max-w-xs leading-relaxed font-normal">
                        Заходьте в кімнати та натискайте на учасників, щоб додати їх у друзі й кликати одним дотиком.
                      </p>
                    </motion.div>
                  ) : (
                    <div className="space-y-2.5">
                      {friends.map((friend, index) => (
                        <motion.div
                          key={friend.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.28, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.985 }}
                          className="p-3.5 rounded-[22px] ios-glass flex items-center justify-between gap-3 shadow-sm"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {friend.avatarUrl ? (
                              <img
                                src={friend.avatarUrl}
                                alt=""
                                className="w-11 h-11 rounded-[15px] object-cover ring-1 ring-white/15 shrink-0"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-[15px] bg-gradient-to-br from-indigo-500/20 to-purple-500/30 text-white flex items-center justify-center text-xs font-bold shrink-0 ring-1 ring-white/15">
                                {friend.displayName.charAt(0)}
                              </div>
                            )}

                            <div className="min-w-0">
                              <h4 className="text-[14px] font-bold text-white truncate leading-tight">
                                {friend.displayName}
                              </h4>
                              {friend.username && (
                                <p className="text-xs text-white/45 truncate mt-0.5 font-normal">
                                  @{friend.username}
                                </p>
                              )}
                              {friend.currentRoom && (
                                <p className="text-[11px] text-indigo-300 truncate mt-0.5 font-medium flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                  <span>У кімнаті: {friend.currentRoom.title}</span>
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {friend.currentRoom && (
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.92 }}
                                onClick={() => {
                                  triggerHaptic('light');
                                  router.push(`/rooms/${friend.currentRoom!.id}`);
                                }}
                                className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-white text-black active:scale-95 transition shadow-sm"
                              >
                                Зайти
                              </motion.button>
                            )}
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleRemoveFriend(friend.id)}
                              className="w-7 h-7 rounded-full text-white/30 hover:text-red-400 active:text-red-500 flex items-center justify-center text-xs transition"
                              title="Видалити з друзів"
                            >
                              ✕
                            </motion.button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </main>
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
