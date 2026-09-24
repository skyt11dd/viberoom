'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { fetchApi } from '../../../lib/api';
import { useAuth } from '../../../contexts/AuthContext';
import { useSocket } from '../../../contexts/SocketContext';
import { useVoice } from '../../../contexts/VoiceContext';
import { useParams, useRouter } from 'next/navigation';
import { YouTubeProvider } from '../../../lib/providers/YouTubeProvider';
import { PlaybackState } from '@viberoom/shared';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatMessage {
  id: string;
  text: string;
  user: { id: string; displayName: string; username?: string; avatarUrl: string | null };
}

interface Reaction {
  id: string;
  emoji: string;
  userId: string;
  displayName: string;
}

interface FriendItem {
  id: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
}

export default function RoomPage() {
  const router = useRouter();
  const { id } = useParams();
  const roomId = typeof id === 'string' ? id : id?.[0] || '';
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const { isMuted, toggleMute, isMicInitializing, leaveVoiceRoom, permissionError } = useVoice();
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [videoUrl, setVideoUrl] = useState('');
  const [hasVideo, setHasVideo] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'members'>('chat');

  // Member profile modal & toast
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Friends invite modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [myFriends, setMyFriends] = useState<FriendItem[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [invitedFriends, setInvitedFriends] = useState<{ [id: string]: boolean }>({});

  const providerRef = useRef<YouTubeProvider | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (permissionError) {
      setToastMessage(permissionError);
      const timer = setTimeout(() => setToastMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [permissionError]);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [reactions, setReactions] = useState<Reaction[]>([]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  useEffect(() => {
    async function loadRoom() {
      try {
        const roomData = await fetchApi(`/rooms/${roomId}`);
        setRoom(roomData);
        await fetchApi(`/rooms/${roomId}/join`, { method: 'POST' });
      } catch (err) {
        console.error('Помилка завантаження кімнати:', err);
      } finally {
        setLoading(false);
      }
    }

    if (user) {
      loadRoom();
    }
  }, [roomId, user]);

  const handleLeaveRoom = useCallback(() => {
    if (socket) {
      socket.emit('room:leave', { roomId });
    }
    leaveVoiceRoom();
    router.push('/');
  }, [socket, roomId, leaveVoiceRoom, router]);

  useEffect(() => {
    const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
    if (tg?.BackButton) {
      tg.BackButton.show();
      const onBack = () => {
        handleLeaveRoom();
      };
      tg.BackButton.onClick(onBack);
      return () => {
        tg.BackButton.offClick(onBack);
        tg.BackButton.hide();
      };
    }
  }, [handleLeaveRoom]);

  // Only leave room and disconnect voice when unmounting the page entirely
  useEffect(() => {
    return () => {
      leaveVoiceRoom();
      if (socket && roomId) {
        socket.emit('room:leave', { roomId });
      }
    };
  }, [socket, roomId, leaveVoiceRoom]);

  // Main socket event subscriptions (depends ONLY on socket connection and roomId)
  useEffect(() => {
    if (!socket || !connected || !roomId) return;

    socket.emit('room:join', { roomId });

    const handleResync = (state: PlaybackState) => handleRemoteState(state);
    const handleVideoSync = (state: PlaybackState) => handleRemoteState(state);
    const handleMembersUpdated = (updatedMembers: any[]) => {
      setRoom((prev: any) => (prev ? { ...prev, members: updatedMembers } : prev));
    };
    const handleHostTransferred = ({ newHostId, newHostName }: { newHostId: string; newHostName: string }) => {
      setRoom((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          ownerId: newHostId,
          members: (prev.members || []).map((m: any) => ({
            ...m,
            role: m.userId === newHostId ? 'OWNER' : (m.role === 'OWNER' ? 'MEMBER' : m.role),
          })),
        };
      });
      showToast(`👑 Новий хост кімнати: ${newHostName}`);
    };
    const handleMemberLeft = ({ userId }: { userId: string }) => {
      setRoom((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          members: (prev.members || []).filter((m: any) => m.userId !== userId),
        };
      });
    };
    const handleRoomDeleted = () => {
      showToast('Кімнату закрито');
      router.push('/');
    };
    const handleChatReceive = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
      const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
      tg?.HapticFeedback?.impactOccurred?.('light');
    };
    const handleChatReaction = (reaction: Reaction) => {
      setReactions((prev) => [...prev, reaction]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== reaction.id));
      }, 2000);
    };

    socket.on('room:resync', handleResync);
    socket.on('video:sync', handleVideoSync);
    socket.on('room:members_updated', handleMembersUpdated);
    socket.on('room:host_transferred', handleHostTransferred);
    socket.on('room:member_left', handleMemberLeft);
    socket.on('room:deleted', handleRoomDeleted);
    socket.on('chat:receive', handleChatReceive);
    socket.on('chat:reaction', handleChatReaction);

    return () => {
      socket.off('room:resync', handleResync);
      socket.off('video:sync', handleVideoSync);
      socket.off('room:members_updated', handleMembersUpdated);
      socket.off('room:host_transferred', handleHostTransferred);
      socket.off('room:member_left', handleMemberLeft);
      socket.off('room:deleted', handleRoomDeleted);
      socket.off('chat:receive', handleChatReceive);
      socket.off('chat:reaction', handleChatReaction);
    };
  }, [socket, connected, roomId, router]);

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const handleRemoteState = async (state: PlaybackState) => {
    if (!providerRef.current && state.provider === 'YouTube') {
      providerRef.current = new YouTubeProvider();
      const container = document.getElementById('player-container');
      if (container) {
        container.innerHTML = '<div id="yt-player"></div>';
        await providerRef.current.load(state.videoId, 'yt-player');
        setHasVideo(true);
      }
    }

    const provider = providerRef.current;
    if (provider) {
      const currentTime = await provider.getCurrentTime();
      if (Math.abs(currentTime - state.position) > 0.5) {
        await provider.seek(state.position);
      }

      if (state.isPlaying) {
        provider.play();
      } else {
        provider.pause();
      }
    }
  };

  const handleLoadVideo = async () => {
    if (!videoUrl.trim()) return;

    if (!providerRef.current) {
      providerRef.current = new YouTubeProvider();
    }

    const provider = providerRef.current;
    if (provider.canHandle(videoUrl)) {
      const videoId = provider.getVideoId(videoUrl);
      if (videoId) {
        const container = document.getElementById('player-container');
        if (container) {
          container.innerHTML = '<div id="yt-player"></div>';
          await provider.load(videoId, 'yt-player');
          setHasVideo(true);
          setShowUrlInput(false);

          provider.onStateChange = (state) => {
            if (socket) {
              socket.emit('video:state', {
                roomId,
                state: {
                  provider: 'YouTube',
                  videoId,
                  position: state.position,
                  isPlaying: state.isPlaying,
                  serverTimestamp: Date.now(),
                },
              });
            }
          };
        }
      }
    }
  };

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    socket.emit('chat:send', { roomId, text: chatInput.trim() });
    setChatInput('');
  };

  const sendReaction = (emoji: string) => {
    if (!socket) return;
    socket.emit('chat:react', { roomId, emoji });
    const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
    tg?.HapticFeedback?.notificationOccurred?.('success');
  };

  const openInviteModal = async () => {
    setShowInviteModal(true);
    try {
      setLoadingFriends(true);
      const friendsData = await fetchApi('/friends');
      if (Array.isArray(friendsData)) setMyFriends(friendsData);
    } catch (err) {
      console.error('Помилка завантаження друзів:', err);
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleInviteFriendViaBot = async (friendId: string, friendName: string) => {
    try {
      setInvitedFriends((prev) => ({ ...prev, [friendId]: true }));
      const res = await fetchApi(`/friends/${friendId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ roomId }),
      });
      showToast(res.message || `Запрошення надіслано ${friendName}!`);
    } catch (err: any) {
      showToast(`Помилка: ${err.message}`);
    }
  };

  const handleAddFriendFromProfile = async (targetUserId: string) => {
    try {
      await fetchApi(`/friends/${targetUserId}`, { method: 'POST' });
      showToast('✓ Додано в друзі!');
      setSelectedProfile((prev: any) => (prev ? { ...prev, isFriend: true } : null));
    } catch (err: any) {
      showToast(err.message || 'Помилка додавання в друзі');
    }
  };

  const handleCopyInviteLink = () => {
    const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || 'VibeRoomBot';
    const inviteLink = `https://t.me/${botUsername}?startapp=room_${roomId}`;
    const textToCopy = `🍿 Приєднуйся до моєї кімнати «${room?.title || 'VIBEROOM'}»!\n🎬 Дивимося відео разом і спілкуємося голосом: ${inviteLink}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      showToast('✓ Посилання скопійовано!');
    } else {
      showToast(inviteLink);
    }
  };

  const handleShareToTelegram = () => {
    const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
    const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || 'VibeRoomBot';
    const inviteLink = `https://t.me/${botUsername}?startapp=room_${roomId}`;
    const text = encodeURIComponent(
      `🍿 Приєднуйся до моєї кімнати «${room?.title || 'VIBEROOM'}»!\n🎬 Дивимося відео разом і спілкуємося голосом!`
    );

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${text}`);
    } else if (navigator.share) {
      navigator.share({ title: room?.title, url: inviteLink }).catch(() => {});
    } else {
      handleCopyInviteLink();
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#090a10] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-white/50">Завантаження кімнати...</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#090a10] text-white p-6 text-center">
        <p className="text-base font-medium text-red-400 mb-4">Кімнату не знайдено або термін її дії закінчився.</p>
        <button
          onClick={() => router.push('/')}
          className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium transition"
        >
          На головну
        </button>
      </div>
    );
  }

  const isOwner =
    room?.ownerId === user?.id ||
    room?.members?.find((m: any) => m.userId === user?.id)?.role === 'OWNER';

  return (
    <div className="flex flex-col h-[100dvh] bg-[#090a10] text-white overflow-hidden select-none relative">
      {/* ── Toast notification banner ── */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-purple-600 text-white text-xs font-semibold shadow-xl border border-white/20"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top Header (iOS Floating Glass) ── */}
      <header className="h-14 px-3 sm:px-4 ios-glass-header flex items-center justify-between shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={handleLeaveRoom}
            className="w-8 h-8 -ml-1 text-white/70 hover:text-white rounded-full flex items-center justify-center hover:bg-white/10 active:scale-90 transition"
            aria-label="Назад"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-[14px] font-bold text-white truncate max-w-[130px] xs:max-w-[170px] sm:max-w-xs leading-tight tracking-tight">
              {room.title}
            </h1>
            <span className="text-[11px] text-white/40 block leading-tight font-medium">
              {isOwner ? '👑 Хост' : 'Учасник'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Voice Mic Toggle (iOS Dynamic Island Style) */}
          <button
            onClick={toggleMute}
            disabled={isMicInitializing}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition active:scale-95 flex items-center gap-1.5 border ${
              isMicInitializing
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 cursor-wait'
                : isMuted
                ? 'bg-white/[0.08] border-white/10 text-white/60 hover:text-white'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-sm'
            }`}
            title={
              isMicInitializing
                ? 'Запит дозволу на мікрофон...'
                : isMuted
                ? 'Увімкнути мікрофон'
                : 'Вимкнути мікрофон'
            }
          >
            {isMicInitializing ? (
              <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            ) : isMuted ? (
              <>
                <span className="text-xs">🔇</span>
                <span className="text-[11px]">Мʼют</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px]">Голос</span>
              </>
            )}
          </button>

          {/* Members Count Badge */}
          <button
            onClick={() => setActiveTab(activeTab === 'members' ? 'chat' : 'members')}
            className={`px-2.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition active:scale-95 border ${
              activeTab === 'members'
                ? 'bg-white text-black border-white shadow-sm'
                : 'bg-white/[0.08] text-white/70 border-white/10 hover:text-white'
            }`}
          >
            <span className="text-xs">👥</span>
            <span>{room.members?.length || 1}</span>
          </button>

          {/* Invite Friend Modal trigger */}
          <button
            onClick={openInviteModal}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white text-black hover:bg-white/90 active:scale-95 transition shadow-sm"
          >
            + Друзі
          </button>
        </div>
      </header>

      {/* ── Main Layout: Mobile Column / Desktop Row ── */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 bg-black">
        {/* Left / Top: Video Section */}
        <div className="flex flex-col md:flex-1 shrink-0 md:shrink bg-black relative border-b md:border-b-0 md:border-r border-white/[0.08]">
          {/* 16:9 Video Area */}
          <div className="w-full aspect-video bg-black relative overflow-hidden flex items-center justify-center">
            {/* Player Element */}
            <div
              id="player-container"
              className={`w-full h-full ${!hasVideo ? 'hidden' : 'block'} ${!isOwner ? 'pointer-events-none' : ''}`}
            >
              <div id="yt-player" className="w-full h-full" />
            </div>

            {/* Empty State / Video Placeholder (Apple TV AirPlay Style) */}
            {!hasVideo && (
              <div className="flex flex-col items-center justify-center p-4 text-center z-0 max-w-sm">
                <div className="w-12 h-12 rounded-[18px] bg-white/[0.06] border border-white/10 flex items-center justify-center text-xl mb-3 shadow-inner">
                  🎬
                </div>
                <p className="text-[14px] font-semibold text-white mb-1">Зараз нічого не грає</p>
                <p className="text-xs text-white/40 max-w-xs mb-4">
                  {isOwner
                    ? 'Вставте посилання на YouTube, щоб дивитися разом'
                    : 'Очікування вибору відео хостом кімнати...'}
                </p>

                {isOwner && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleLoadVideo();
                    }}
                    className="flex w-full gap-2"
                  >
                    <input
                      type="text"
                      placeholder="Вставте YouTube URL..."
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      className="flex-1 bg-white/[0.08] border border-white/10 focus:border-white/30 rounded-full px-4 py-2 text-xs text-white placeholder-white/30 focus:outline-none transition"
                    />
                    <button
                      type="submit"
                      disabled={!videoUrl.trim()}
                      className="px-4 py-2 rounded-full text-xs font-semibold bg-white text-black disabled:opacity-40 transition active:scale-95 shrink-0 shadow-sm"
                    >
                      Старт
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Floating Reactions Overlay */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
              <AnimatePresence>
                {reactions.map((r) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 30, x: Math.random() * 80 - 40, scale: 0.6 }}
                    animate={{ opacity: [0, 1, 1, 0], y: -130, scale: 1.8 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.8, ease: 'easeOut' }}
                    className="absolute bottom-4 left-1/2 text-3xl select-none"
                  >
                    {r.emoji}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Change Video Button for Owner */}
            {hasVideo && isOwner && (
              <div className="absolute top-2.5 right-2.5 z-10">
                <button
                  onClick={() => setShowUrlInput(!showUrlInput)}
                  className="px-3 py-1 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white/80 hover:text-white text-xs font-medium border border-white/15 transition active:scale-95 flex items-center gap-1"
                >
                  <span>Змінити відео</span>
                </button>
              </div>
            )}
          </div>

          {/* Collapsible Change Video Input for Owner */}
          {hasVideo && isOwner && showUrlInput && (
            <div className="p-3 ios-glass border-t border-white/10 flex gap-2 items-center">
              <input
                type="text"
                placeholder="Нове посилання на YouTube..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="flex-1 bg-white/[0.08] border border-white/10 focus:border-white/30 rounded-full px-3.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none"
              />
              <button
                onClick={handleLoadVideo}
                disabled={!videoUrl.trim()}
                className="px-4 py-1.5 rounded-full text-xs font-semibold bg-white text-black disabled:opacity-40 shrink-0"
              >
                Оновити
              </button>
              <button
                onClick={() => setShowUrlInput(false)}
                className="w-7 h-7 rounded-full bg-white/10 text-white/50 hover:text-white text-xs flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Right / Bottom: Content Section (Chat / Members) */}
        <div className="flex-1 flex flex-col min-h-0 bg-black md:max-w-md lg:max-w-lg md:border-l md:border-white/[0.08]">
          {/* iOS Segmented Tabs Control */}
          <div className="p-1 mx-3 my-2 rounded-full bg-white/[0.06] border border-white/[0.06] backdrop-blur-xl flex items-center justify-between shrink-0">
            <div className="flex flex-1 gap-1">
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-1.5 rounded-full text-xs font-semibold transition ${
                  activeTab === 'chat'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                Чат {messages.length > 0 && `(${messages.length})`}
              </button>
              <button
                onClick={() => setActiveTab('members')}
                className={`flex-1 py-1.5 rounded-full text-xs font-semibold transition ${
                  activeTab === 'members'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                Учасники ({room.members?.length || 1})
              </button>
            </div>
            <div className="px-3 text-[11px] text-emerald-400 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live</span>
            </div>
          </div>

          {/* Tab 1: Chat Content */}
          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Messages list */}
              <div className="flex-1 p-3 overflow-y-auto space-y-2.5 min-h-0">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <p className="text-xs text-white/30 font-medium">Поки що немає повідомлень</p>
                    <p className="text-[11px] text-white/20 mt-0.5">Напишіть щось або надішліть реакцію! 👋</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.user.id === user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isMe && (
                          <div
                            onClick={() => setSelectedProfile(msg.user)}
                            className="shrink-0 pt-0.5 cursor-pointer active:scale-90 transition"
                            title="Переглянути профіль"
                          >
                            {msg.user.avatarUrl ? (
                              <img
                                src={msg.user.avatarUrl}
                                alt=""
                                className="w-7 h-7 rounded-[10px] object-cover ring-1 ring-white/10"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-[10px] bg-white/10 flex items-center justify-center text-[11px] font-semibold text-white/80">
                                {msg.user.displayName.charAt(0)}
                              </div>
                            )}
                          </div>
                        )}

                        <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[82%]`}>
                          {!isMe && (
                            <button
                              onClick={() => setSelectedProfile(msg.user)}
                              className="text-[11px] text-white/40 mb-1 ml-1 font-medium hover:text-white transition text-left"
                            >
                              {msg.user.displayName}
                            </button>
                          )}
                          <div
                            className={`px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed break-words ${
                              isMe
                                ? 'bg-[#007aff] text-white rounded-tr-xs shadow-sm font-normal'
                                : 'ios-glass text-white/90 rounded-tl-xs'
                            }`}
                          >
                            {msg.text}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Reactions Bar (iOS Floating Pills) */}
              <div className="px-3 py-1.5 border-t border-white/[0.06] flex items-center justify-around bg-black shrink-0">
                {['❤️', '🔥', '😂', '🎉', '👍', '🍿'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => sendReaction(emoji)}
                    className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/10 active:scale-125 transition flex items-center justify-center text-lg select-none"
                    aria-label={`Реакція ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={sendChat}
                className="p-2 sm:p-2.5 ios-glass-bottom flex items-center gap-2 shrink-0 pb-[max(8px,env(safe-area-inset-bottom))]"
              >
                <input
                  type="text"
                  placeholder="Повідомлення..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 bg-white/[0.07] border border-white/10 focus:border-white/30 rounded-full px-4 py-2 text-xs sm:text-sm text-white placeholder-white/30 focus:outline-none transition"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white text-black disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center shrink-0 transition active:scale-90 shadow-sm"
                  aria-label="Надіслати"
                >
                  <svg
                    className="w-4 h-4 translate-x-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.4}
                      d="M5 12h14M12 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </form>
            </div>
          )}

          {/* Tab 2: Members Content */}
          {activeTab === 'members' && (
            <div className="flex-1 p-3 overflow-y-auto space-y-2 min-h-0">
              <div className="text-[11px] font-semibold text-white/40 px-1 py-1 uppercase tracking-wider">
                Учасники в кімнаті ({room.members?.length || 1})
              </div>

              {room.members?.map((member: any) => {
                const isHost = member.userId === room.ownerId;
                const isMe = member.userId === user?.id;
                const u = member.user || {};

                return (
                  <div
                    key={member.id || member.userId}
                    onClick={() => setSelectedProfile({ ...u, isHost })}
                    className="flex items-center justify-between p-3 rounded-[18px] ios-glass cursor-pointer hover:bg-white/[0.08] active:scale-[0.99] transition shadow-sm"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {u.avatarUrl ? (
                        <img
                          src={u.avatarUrl}
                          alt=""
                          className="w-10 h-10 rounded-[14px] object-cover shrink-0 ring-1 ring-white/15"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-[14px] bg-white/10 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                          {u.displayName?.charAt(0) || 'U'}
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-white truncate">
                            {u.displayName || 'Користувач'}
                          </span>
                          {isMe && (
                            <span className="text-[10px] text-white/60 bg-white/10 px-1.5 py-0.2 rounded font-normal">
                              ви
                            </span>
                          )}
                        </div>
                        {u.username && (
                          <span className="text-xs text-white/40 block leading-none mt-0.5">
                            @{u.username}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isHost && (
                        <span className="text-[11px] font-medium text-amber-300 bg-amber-400/15 border border-amber-400/25 px-2.5 py-0.5 rounded-full">
                          👑 Хост
                        </span>
                      )}
                      <span className="text-white/30 text-sm font-light">›</span>
                    </div>
                  </div>
                );
              })}

              <div className="pt-4 flex flex-col gap-2.5">
                <button
                  onClick={openInviteModal}
                  className="w-full py-3 px-4 rounded-full text-xs font-semibold bg-white text-black active:scale-95 transition flex items-center justify-center gap-1.5 shadow-md"
                >
                  <span>Покликати друзів у кімнату</span>
                </button>
                <button
                  onClick={handleShareToTelegram}
                  className="w-full py-3 px-4 rounded-full text-xs font-medium bg-white/10 text-white hover:bg-white/15 active:scale-95 transition flex items-center justify-center gap-1.5"
                >
                  <span>Надіслати посилання в чат</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── User Profile Modal / iOS Bottom Sheet ── */}
      <AnimatePresence>
        {selectedProfile && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-xs rounded-t-[32px] sm:rounded-[28px] ios-glass-elevated p-6 shadow-2xl flex flex-col items-center text-center relative border border-white/10"
            >
              <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto mb-4 sm:hidden" />

              <button
                onClick={() => setSelectedProfile(null)}
                className="w-7 h-7 rounded-full bg-white/10 text-white/50 hover:text-white flex items-center justify-center text-xs absolute top-4 right-4"
              >
                ✕
              </button>

              {/* Avatar */}
              {selectedProfile.avatarUrl ? (
                <img
                  src={selectedProfile.avatarUrl}
                  alt=""
                  className="w-16 h-16 rounded-[20px] object-cover mb-3 ring-2 ring-white/15 shadow-xl"
                />
              ) : (
                <div className="w-16 h-16 rounded-[20px] bg-white/10 text-xl font-bold text-white flex items-center justify-center mb-3 shadow-xl">
                  {selectedProfile.displayName?.charAt(0) || 'U'}
                </div>
              )}

              {/* Name & username */}
              <h3 className="text-base font-bold text-white mb-0.5 tracking-tight">
                {selectedProfile.displayName || 'Користувач'}
              </h3>
              {selectedProfile.username && (
                <p className="text-xs text-white/40 mb-3">@{selectedProfile.username}</p>
              )}

              {/* Badge */}
              <div className="mb-5">
                {selectedProfile.isHost || selectedProfile.id === room.ownerId ? (
                  <span className="text-xs font-medium text-amber-300 bg-amber-400/15 border border-amber-400/25 px-3 py-1 rounded-full">
                    👑 Хост кімнати
                  </span>
                ) : (
                  <span className="text-xs font-medium text-white/60 bg-white/[0.08] border border-white/10 px-3 py-1 rounded-full">
                    Учасник
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="w-full flex flex-col gap-2.5">
                {selectedProfile.id !== user?.id && (
                  <button
                    onClick={() => handleAddFriendFromProfile(selectedProfile.id)}
                    className="w-full py-3 rounded-2xl text-xs font-semibold bg-white text-black active:scale-95 transition flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <span>Додати в друзі</span>
                  </button>
                )}

                {selectedProfile.username && (
                  <button
                    onClick={() => {
                      const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
                      const link = `https://t.me/${selectedProfile.username}`;
                      if (tg?.openTelegramLink) {
                        tg.openTelegramLink(link);
                      } else {
                        window.open(link, '_blank');
                      }
                    }}
                    className="w-full py-3 rounded-2xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white active:scale-95 transition flex items-center justify-center gap-1.5"
                  >
                    <span>Написати в Telegram</span>
                  </button>
                )}

                <button
                  onClick={() => setSelectedProfile(null)}
                  className="w-full py-2.5 rounded-2xl text-xs font-medium text-white/50 hover:text-white transition"
                >
                  Закрити
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Invite Friends & Share Modal (iOS Bottom Sheet) ── */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-sm rounded-t-[32px] sm:rounded-[28px] ios-glass-elevated p-6 shadow-2xl flex flex-col max-h-[85vh] border border-white/10"
            >
              <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto mb-4 sm:hidden" />

              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Запросити друзів</h3>
                  <p className="text-xs text-white/40 mt-0.5">Надішліть сповіщення прямо в Telegram</p>
                </div>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="w-7 h-7 rounded-full bg-white/10 text-white/50 hover:text-white flex items-center justify-center text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Quick Link Share & Copy */}
              <div className="p-3.5 rounded-2xl ios-glass mb-4 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    Інвайт-посилання
                  </div>
                  <div className="text-[11px] text-white/40 truncate mt-0.5">
                    t.me/VibeRoomBot?startapp=room_{roomId.slice(0, 8)}...
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleCopyInviteLink}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/10 hover:bg-white/15 text-white transition active:scale-95"
                  >
                    Копіювати
                  </button>
                  <button
                    onClick={handleShareToTelegram}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white text-black hover:bg-white/90 transition active:scale-95 shadow-sm"
                  >
                    Шерити
                  </button>
                </div>
              </div>

              {/* Friends List for direct notification */}
              <div className="text-[11px] font-semibold text-white/40 mb-2 uppercase tracking-wider">
                Покликати через бота
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1">
                {loadingFriends ? (
                  <div className="py-8 text-center text-xs text-white/40 font-medium">
                    Завантаження друзів...
                  </div>
                ) : myFriends.length === 0 ? (
                  <div className="py-8 text-center text-xs text-white/40 leading-relaxed px-2">
                    У вас ще немає доданих друзів. Скопіюйте інвайт-посилання вище та надішліть у будь-який чат!
                  </div>
                ) : (
                  myFriends.map((f) => (
                    <div
                      key={f.id}
                      className="p-2.5 rounded-[16px] ios-glass flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {f.avatarUrl ? (
                          <img
                            src={f.avatarUrl}
                            alt=""
                            className="w-9 h-9 rounded-[12px] object-cover shrink-0 ring-1 ring-white/10"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-[12px] bg-white/10 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                            {f.displayName.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-white truncate leading-tight">
                            {f.displayName}
                          </div>
                          {f.username && (
                            <div className="text-xs text-white/40 truncate mt-0.5">
                              @{f.username}
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleInviteFriendViaBot(f.id, f.displayName)}
                        disabled={invitedFriends[f.id]}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition active:scale-95 shrink-0 ${
                          invitedFriends[f.id]
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-white text-black shadow-sm'
                        }`}
                      >
                        {invitedFriends[f.id] ? '✓ Надіслано' : 'Покликати'}
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-3 border-t border-white/[0.06] mt-3">
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="w-full py-2.5 rounded-2xl text-xs font-medium text-white/60 hover:text-white transition"
                >
                  Закрити
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
