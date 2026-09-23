'use client';

import { useEffect, useState, useRef } from 'react';
import { fetchApi } from '../../../lib/api';
import { useAuth } from '../../../contexts/AuthContext';
import { useSocket } from '../../../contexts/SocketContext';
import { useVoice } from '../../../contexts/VoiceContext';
import { useParams } from 'next/navigation';
import { YouTubeProvider } from '../../../lib/providers/YouTubeProvider';
import { PlaybackState } from '@viberoom/shared';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatMessage {
  id: string;
  text: string;
  user: { id: string; displayName: string; avatarUrl: string | null };
}

interface Reaction {
  id: string;
  emoji: string;
  userId: string;
  displayName: string;
}

export default function RoomPage() {
  const { id } = useParams();
  const roomId = typeof id === 'string' ? id : id?.[0] || '';
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const { isMuted, toggleMute } = useVoice();
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [videoUrl, setVideoUrl] = useState('');
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
        console.error('Failed to load room:', err);
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
      
      socket.on('chat:receive', (msg: ChatMessage) => {
        setMessages((prev) => [...prev, msg]);
      });

      socket.on('chat:reaction', (reaction: Reaction) => {
        setReactions((prev) => [...prev, reaction]);
        // Remove reaction after animation (2s)
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
        socket.off('chat:receive');
        socket.off('chat:reaction');
      }
    };
  }, [socket, connected, room, roomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleRemoteState = async (state: PlaybackState) => {
    if (!providerRef.current && state.provider === 'YouTube') {
      providerRef.current = new YouTubeProvider();
      document.getElementById('player-container')!.innerHTML = '<div id="yt-player"></div>';
      await providerRef.current.load(state.videoId, 'yt-player');
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
    if (!providerRef.current) {
      providerRef.current = new YouTubeProvider();
    }
    
    const provider = providerRef.current;
    if (provider.canHandle(videoUrl)) {
      const videoId = provider.getVideoId(videoUrl);
      if (videoId) {
        document.getElementById('player-container')!.innerHTML = '<div id="yt-player"></div>';
        await provider.load(videoId, 'yt-player');
        
        provider.onStateChange = (state) => {
          if (socket) {
            socket.emit('video:state', {
              roomId,
              state: { provider: 'YouTube', videoId, position: state.position, isPlaying: state.isPlaying, serverTimestamp: Date.now() }
            });
          }
        };
      }
    }
  };

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    socket.emit('chat:send', { roomId, text: chatInput });
    setChatInput('');
  };

  const sendReaction = (emoji: string) => {
    if (!socket) return;
    socket.emit('chat:react', { roomId, emoji });
  };

  if (loading) return <div className="p-8 text-center">Loading Room...</div>;
  if (!room) return <div className="p-8 text-center text-red-500">Room not found.</div>;

  const isOwner = room?.members?.find((m: any) => m.userId === user?.id)?.role === 'OWNER';

  return (
    <div className="flex flex-col min-h-screen bg-neutral-900 text-white">
      <header className="p-4 border-b border-neutral-800 flex justify-between items-center z-10 bg-neutral-900">
        <h1 className="text-xl font-bold">{room.title}</h1>
        <div className="flex items-center space-x-4">
          <button 
            onClick={toggleMute}
            className={`p-2 rounded-full transition ${isMuted ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-neutral-800 text-white hover:bg-neutral-700'}`}
          >
            {isMuted ? '🔇' : '🎙️'}
          </button>
          
          {isOwner && (
            <div className="flex items-center space-x-2">
              <input 
                type="text" 
                placeholder="Paste YouTube URL..." 
                className="bg-neutral-800 px-3 py-1 rounded text-sm w-64 focus:outline-none"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
              <button onClick={handleLoadVideo} className="bg-neutral-700 hover:bg-neutral-600 px-3 py-1 rounded text-sm transition">
                Load
              </button>
            </div>
          )}
          <div className="flex items-center space-x-2 bg-neutral-800 px-3 py-1 rounded-full text-sm">
            <span className="mr-2">👥 {room.members?.length || 0}</span>
            <div className="flex -space-x-2">
              {room.members?.slice(0, 3).map((m: any) => (
                m.user.avatarUrl ? (
                  <img key={m.id} src={m.user.avatarUrl} alt={m.user.displayName} className="w-6 h-6 rounded-full border border-neutral-800" />
                ) : (
                  <div key={m.id} className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] border border-neutral-800">
                    {m.user.displayName.charAt(0)}
                  </div>
                )
              ))}
            </div>
          </div>
          <button 
            onClick={async () => {
              if (typeof window !== 'undefined') {
                const WebApp = (await import('@twa-dev/sdk')).default;
                if (WebApp.initData) {
                  const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || 'VibeRoomBot'; // Replace with actual bot username
                  const inviteLink = `https://t.me/${botUsername}?startapp=room_${roomId}`;
                  const text = encodeURIComponent('Join my VibeRoom to watch videos together! 🍿');
                  WebApp.openTelegramLink(`https://t.me/share/url?url=${inviteLink}&text=${text}`);
                  return;
                }
              }
              // Fallback for normal browser
              const fallbackLink = `https://t.me/share/url?url=${window.location.href}`;
              window.open(fallbackLink, '_blank');
            }}
            className="bg-blue-600 hover:bg-blue-500 px-4 py-1 rounded font-medium transition"
          >
            Invite Friend
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Video Area */}
        <div className="flex-1 flex flex-col relative bg-black">
          <div className="flex-1 flex items-center justify-center p-4">
            <div 
              id="player-container" 
              className={`w-full h-full max-w-5xl max-h-[80vh] bg-neutral-900 rounded-xl overflow-hidden shadow-2xl relative ${!isOwner ? 'pointer-events-none' : ''}`}
            >
              <div id="yt-player" className="w-full h-full flex items-center justify-center">
                <p className="text-neutral-500 text-lg">Paste a link and click Load</p>
              </div>
            </div>
          </div>

          {/* Floating Reactions overlay */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <AnimatePresence>
              {reactions.map((r) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 50, x: Math.random() * 100 - 50, scale: 0.5 }}
                  animate={{ opacity: [0, 1, 1, 0], y: -200, scale: 2 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2, ease: "easeOut" }}
                  className="absolute bottom-10 left-1/2 text-4xl"
                >
                  {r.emoji}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Quick Reactions Bar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-neutral-800/80 backdrop-blur rounded-full px-4 py-2 flex space-x-2">
            {['❤️', '😂', '🔥', '🎉', '🤯'].map(emoji => (
              <button 
                key={emoji} 
                onClick={() => sendReaction(emoji)}
                className="hover:scale-125 transition-transform text-xl"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Sidebar Chat */}
        <aside className="w-80 border-l border-neutral-800 bg-neutral-900 flex flex-col shadow-xl z-10">
          <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
            <h2 className="font-semibold text-neutral-200">Room Chat</h2>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.user.id === user?.id ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex max-w-[90%] gap-2 ${msg.user.id === user?.id ? 'flex-row-reverse' : 'flex-row'}`}>
                  {msg.user.avatarUrl ? (
                    <img src={msg.user.avatarUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center text-xs flex-shrink-0">
                      {msg.user.displayName.charAt(0)}
                    </div>
                  )}
                  <div className={`flex flex-col ${msg.user.id === user?.id ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] text-neutral-500 mb-1">{msg.user.displayName}</span>
                    <div className={`px-3 py-2 rounded-xl text-sm ${msg.user.id === user?.id ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-neutral-800 text-neutral-200 rounded-tl-sm'}`}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendChat} className="p-3 bg-neutral-800 flex gap-2">
            <input 
              type="text" 
              placeholder="Send a message..." 
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              className="flex-1 bg-neutral-900 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button type="submit" disabled={!chatInput.trim()} className="bg-blue-600 disabled:opacity-50 hover:bg-blue-500 p-2 rounded-full transition">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          </form>
        </aside>
      </main>
    </div>
  );
}
