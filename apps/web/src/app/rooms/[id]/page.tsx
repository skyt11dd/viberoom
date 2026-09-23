'use client';

import { useEffect, useState, useRef } from 'react';
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

export default function RoomPage() {
  const router = useRouter();
  const { id } = useParams();
  const roomId = typeof id === 'string' ? id : id?.[0] || '';
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const { isMuted, toggleMute } = useVoice();
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [videoUrl, setVideoUrl] = useState('');
  const [hasVideo, setHasVideo] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'members'>('chat');

  // Member profile modal
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);

  const providerRef = useRef<YouTubeProvider | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [reactions, setReactions] = useState<Reaction[]>([]);

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

  useEffect(() => {
    if (socket && connected && room) {
      socket.emit('room:join', { roomId });

      socket.on('room:resync', (state: PlaybackState) => handleRemoteState(state));
      socket.on('video:sync', (state: PlaybackState) => handleRemoteState(state));

      // Real-time members sync
      socket.on('room:members_updated', (updatedMembers: any[]) => {
        setRoom((prev: any) => {
          if (!prev) return prev;
          return { ...prev, members: updatedMembers };
        });
      });

      socket.on('chat:receive', (msg: ChatMessage) => {
        setMessages((prev) => [...prev, msg]);
      });

      socket.on('chat:reaction', (reaction: Reaction) => {
        setReactions((prev) => [...prev, reaction]);
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== reaction.id));
        }, 2000);
      });
    }

    return () => {
      if (socket) {
        socket.emit('room:leave', { roomId });
        socket.off('room:resync');
        socket.off('video:sync');
        socket.off('room:members_updated');
        socket.off('chat:receive');
        socket.off('chat:reaction');
      }
    };
  }, [socket, connected, room, roomId]);

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
  };

  const handleShare = () => {
    const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
    const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || 'VibeRoomBot';
    const inviteLink = `https://t.me/${botUsername}?startapp=room_${roomId}`;
    const text = encodeURIComponent(`🍿 Дивімося відео разом у VIBEROOM! Кімната: "${room?.title || 'Кімната'}"`);

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${text}`);
    } else if (navigator.share) {
      navigator.share({ title: room?.title, url: inviteLink }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(inviteLink);
      alert('Посилання для запрошення скопійовано!');
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg,#0e0e11)] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-white/50">Завантаження кімнати...</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[var(--bg,#0e0e11)] text-white p-6 text-center">
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
    <div className="flex flex-col h-[100dvh] bg-[var(--bg,#0e0e11)] text-white overflow-hidden select-none">
      {/* ── Top Header ── */}
      <header className="h-14 px-3 sm:px-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-[var(--bg,#0e0e11)]/95 backdrop-blur-md z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => router.push('/')}
            className="p-1.5 -ml-1 text-white/70 hover:text-white rounded-lg active:scale-95 transition"
            aria-label="Назад"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-white truncate max-w-[130px] xs:max-w-[170px] sm:max-w-xs leading-tight">
              {room.title}
            </h1>
            <span className="text-[11px] text-white/40 block leading-tight">
              {isOwner ? '👑 Хост' : 'Учасник'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Voice Mic Toggle */}
          <button
            onClick={toggleMute}
            className={`p-2 rounded-full text-xs transition active:scale-90 flex items-center justify-center border ${
              isMuted
                ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25 ring-2 ring-emerald-500/30'
            }`}
            title={isMuted ? 'Увімкнути мікрофон' : 'Вимкнути мікрофон'}
          >
            <span className="text-sm leading-none">{isMuted ? '🔇' : '🎙️'}</span>
          </button>

          {/* Members Badge */}
          <button
            onClick={() => setActiveTab(activeTab === 'members' ? 'chat' : 'members')}
            className={`px-2.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition active:scale-95 border ${
              activeTab === 'members'
                ? 'bg-white/20 text-white border-white/30'
                : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
            }`}
          >
            <span className="text-xs">👥</span>
            <span>{room.members?.length || 1}</span>
          </button>

          {/* Invite Friend */}
          <button
            onClick={handleShare}
            className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--button,#007aff)] text-white hover:opacity-90 active:scale-95 transition flex items-center gap-1 shadow-sm"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden xs:inline">Запросити</span>
          </button>
        </div>
      </header>

      {/* ── Main Layout: Mobile Column / Desktop Row ── */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* Left / Top: Video Section */}
        <div className="flex flex-col md:flex-1 shrink-0 md:shrink bg-black relative border-b md:border-b-0 md:border-r border-white/10">
          {/* 16:9 Video Area */}
          <div className="w-full aspect-video bg-neutral-950 relative overflow-hidden flex items-center justify-center">
            {/* Player Element */}
            <div
              id="player-container"
              className={`w-full h-full ${!hasVideo ? 'hidden' : 'block'} ${!isOwner ? 'pointer-events-none' : ''}`}
            >
              <div id="yt-player" className="w-full h-full" />
            </div>

            {/* Empty State / Video Placeholder */}
            {!hasVideo && (
              <div className="flex flex-col items-center justify-center p-4 text-center z-0">
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl mb-3 shadow-inner">
                  🎬
                </div>
                <p className="text-sm font-semibold text-white/90 mb-1">Зараз нічого не грає</p>
                <p className="text-xs text-white/40 max-w-xs mb-4">
                  {isOwner
                    ? 'Вставте посилання на YouTube нижче, щоб дивитися разом'
                    : 'Очікування вибору відео хостом кімнати...'}
                </p>

                {isOwner && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleLoadVideo();
                    }}
                    className="flex w-full max-w-sm gap-2"
                  >
                    <input
                      type="text"
                      placeholder="Вставте посилання на YouTube..."
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      className="flex-1 bg-white/10 border border-white/15 focus:border-[var(--button,#007aff)] rounded-xl px-3.5 py-2 text-xs text-white placeholder-white/40 focus:outline-none transition"
                    />
                    <button
                      type="submit"
                      disabled={!videoUrl.trim()}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--button,#007aff)] disabled:opacity-40 text-white transition active:scale-95 shrink-0"
                    >
                      ▶ Старт
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
              <div className="absolute top-2 right-2 z-10">
                <button
                  onClick={() => setShowUrlInput(!showUrlInput)}
                  className="px-2.5 py-1 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-md text-white/80 hover:text-white text-[11px] font-medium border border-white/20 transition active:scale-95 flex items-center gap-1"
                >
                  <span>🔗</span>
                  <span>Змінити</span>
                </button>
              </div>
            )}
          </div>

          {/* Collapsible Change Video Input for Owner */}
          {hasVideo && isOwner && showUrlInput && (
            <div className="p-2.5 bg-neutral-900 border-t border-white/10 flex gap-2 items-center">
              <input
                type="text"
                placeholder="Нове посилання на YouTube..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="flex-1 bg-white/5 border border-white/15 focus:border-[var(--button,#007aff)] rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/40 focus:outline-none"
              />
              <button
                onClick={handleLoadVideo}
                disabled={!videoUrl.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--button,#007aff)] disabled:opacity-40 text-white shrink-0"
              >
                Завантажити
              </button>
              <button
                onClick={() => setShowUrlInput(false)}
                className="p-1.5 text-white/50 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Right / Bottom: Content Section (Chat / Members) */}
        <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg,#0e0e11)] md:max-w-md lg:max-w-lg md:border-l md:border-white/10">
          {/* Segmented Tabs Control */}
          <div className="h-10 px-3 border-b border-white/10 flex items-center justify-between shrink-0 bg-[var(--bg,#0e0e11)]">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('chat')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  activeTab === 'chat'
                    ? 'bg-white/15 text-white font-semibold'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                💬 Чат {messages.length > 0 && `(${messages.length})`}
              </button>
              <button
                onClick={() => setActiveTab('members')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  activeTab === 'members'
                    ? 'bg-white/15 text-white font-semibold'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                👥 Учасники ({room.members?.length || 1})
              </button>
            </div>

            <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Онлайн
            </span>
          </div>

          {/* Tab 1: Chat Content */}
          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Messages list */}
              <div className="flex-1 p-3 overflow-y-auto space-y-2.5 min-h-0">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <p className="text-xs text-white/30">Поки що немає повідомлень.</p>
                    <p className="text-xs text-white/20 mt-0.5">Привітайтеся з усіма! 👋</p>
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
                                className="w-7 h-7 rounded-full object-cover ring-1 ring-white/10"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold text-white/80">
                                {msg.user.displayName.charAt(0)}
                              </div>
                            )}
                          </div>
                        )}

                        <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[82%]`}>
                          {!isMe && (
                            <button
                              onClick={() => setSelectedProfile(msg.user)}
                              className="text-[10px] text-white/50 mb-0.5 ml-1 font-medium hover:text-purple-300 transition text-left"
                            >
                              {msg.user.displayName}
                            </button>
                          )}
                          <div
                            className={`px-3 py-2 rounded-2xl text-xs sm:text-sm leading-relaxed break-words ${
                              isMe
                                ? 'bg-[var(--button,#007aff)] text-white rounded-tr-xs'
                                : 'bg-[var(--bg-secondary,#1a1a1e)] text-white/90 border border-white/5 rounded-tl-xs'
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

              {/* Quick Reactions Bar */}
              <div className="px-3 py-1.5 border-t border-white/5 flex items-center justify-around bg-[var(--bg,#0e0e11)] shrink-0">
                {['❤️', '🔥', '😂', '🎉', '👍'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => sendReaction(emoji)}
                    className="p-1 text-xl hover:scale-125 active:scale-90 transition-transform select-none"
                    aria-label={`Реакція ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={sendChat}
                className="p-2 sm:p-2.5 bg-[var(--bg,#0e0e11)] border-t border-white/10 flex items-center gap-2 shrink-0 pb-[max(8px,env(safe-area-inset-bottom))]"
              >
                <input
                  type="text"
                  placeholder="Повідомлення..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 bg-[var(--bg-secondary,#1a1a1e)] border border-white/10 focus:border-[var(--button,#007aff)] rounded-full px-4 py-2 text-xs sm:text-sm text-white placeholder-white/35 focus:outline-none transition"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[var(--button,#007aff)] disabled:opacity-30 disabled:pointer-events-none text-white flex items-center justify-center shrink-0 transition active:scale-90 shadow-sm"
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
              <div className="text-xs font-semibold text-white/50 px-1 py-1 uppercase tracking-wider">
                Учасники в кімнаті ({room.members?.length || 1})
              </div>

              {room.members?.map((member: any) => {
                const isHost = member.role === 'OWNER' || member.userId === room.ownerId;
                const isMe = member.userId === user?.id;
                const u = member.user || {};

                return (
                  <div
                    key={member.id || member.userId}
                    onClick={() => setSelectedProfile({ ...u, isHost })}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-secondary,#1a1a1e)] border border-white/5 cursor-pointer hover:bg-white/5 active:scale-[0.99] transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {u.avatarUrl ? (
                        <img
                          src={u.avatarUrl}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-white/10"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-purple-600/30 text-purple-300 border border-purple-500/20 flex items-center justify-center text-xs font-semibold shrink-0">
                          {u.displayName?.charAt(0) || 'U'}
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-white truncate">
                            {u.displayName || 'Користувач'}
                          </span>
                          {isMe && (
                            <span className="text-[10px] text-white/40 bg-white/10 px-1.5 py-0.2 rounded font-normal">
                              ви
                            </span>
                          )}
                        </div>
                        {u.username && (
                          <span className="text-[11px] text-white/40 block leading-none">
                            @{u.username}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isHost && (
                        <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/20 px-2 py-0.5 rounded-full">
                          👑 Хост
                        </span>
                      )}
                      <span className="text-white/30 text-xs">›</span>
                    </div>
                  </div>
                );
              })}

              <div className="pt-4">
                <button
                  onClick={handleShare}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-[var(--button,#007aff)] text-white hover:opacity-90 active:scale-95 transition flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <span>➕ Запросити ще друзів</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── User Profile Modal / Sheet ── */}
      <AnimatePresence>
        {selectedProfile && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="w-full max-w-xs rounded-2xl bg-[var(--bg-secondary,#1a1a1e)] border border-white/10 p-5 shadow-2xl flex flex-col items-center text-center relative"
            >
              <button
                onClick={() => setSelectedProfile(null)}
                className="absolute top-3 right-3 p-1.5 text-white/40 hover:text-white text-xs"
              >
                ✕
              </button>

              {/* Avatar */}
              {selectedProfile.avatarUrl ? (
                <img
                  src={selectedProfile.avatarUrl}
                  alt=""
                  className="w-16 h-16 rounded-full object-cover mb-3 ring-2 ring-purple-500/30 shadow-lg"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-xl font-bold text-white flex items-center justify-center mb-3 shadow-lg">
                  {selectedProfile.displayName?.charAt(0) || 'U'}
                </div>
              )}

              {/* Name & username */}
              <h3 className="text-base font-bold text-white mb-0.5">
                {selectedProfile.displayName || 'Користувач'}
              </h3>
              {selectedProfile.username && (
                <p className="text-xs text-white/50 mb-3">@{selectedProfile.username}</p>
              )}

              {/* Badge */}
              <div className="mb-5">
                {selectedProfile.isHost || selectedProfile.id === room.ownerId ? (
                  <span className="text-xs font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/25 px-2.5 py-1 rounded-full">
                    👑 Хост кімнати
                  </span>
                ) : (
                  <span className="text-xs font-medium text-white/60 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
                    Учасник
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="w-full flex flex-col gap-2">
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
                    className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[var(--button,#007aff)] text-white hover:opacity-90 active:scale-95 transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span>💬 Написати в Telegram</span>
                  </button>
                )}

                <button
                  onClick={() => setSelectedProfile(null)}
                  className="w-full py-2 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/15 text-white/80 transition"
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
