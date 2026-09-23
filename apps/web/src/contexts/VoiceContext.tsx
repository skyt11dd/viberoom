'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';

interface VoiceContextType {
  isMuted: boolean;
  isMicInitializing: boolean;
  permissionError: string | null;
  toggleMute: () => Promise<void>;
  remoteStreams: { [socketId: string]: MediaStream };
  leaveVoiceRoom: () => void;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

const STUN_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { socket, connected } = useSocket();
  const [isMuted, setIsMuted] = useState(true);
  const [isMicInitializing, setIsMicInitializing] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<{ [id: string]: MediaStream }>({});
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<{ [id: string]: RTCPeerConnection }>({});

  const leaveVoiceRoom = useCallback(() => {
    Object.values(peerConnectionsRef.current).forEach(pc => {
      try {
        pc.close();
      } catch (_) {}
    });
    peerConnectionsRef.current = {};
    setRemoteStreams({});

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setIsMuted(true);
    setIsMicInitializing(false);
    setPermissionError(null);
  }, []);

  const createPeerConnection = useCallback((targetId: string, roomId: string) => {
    if (peerConnectionsRef.current[targetId]) return peerConnectionsRef.current[targetId];

    const pc = new RTCPeerConnection(STUN_SERVERS);
    peerConnectionsRef.current[targetId] = pc;

    // Attach local track if active, or pre-configure audio transceiver for later attachment
    if (localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    } else {
      try {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      } catch (e) {
        console.warn('Could not add audio transceiver', e);
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('voice:ice-candidate', { targetId, candidate: event.candidate, roomId });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStreams(prev => ({
          ...prev,
          [targetId]: event.streams[0]
        }));
      }
    };

    return pc;
  }, [socket]);

  useEffect(() => {
    if (!socket || !connected) return;

    const handleRoomJoin = async (payload: { socketId: string; userId: string; roomId: string }) => {
      if (payload.socketId === socket.id) return;
      
      const pc = createPeerConnection(payload.socketId, payload.roomId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socket.emit('voice:offer', { targetId: payload.socketId, offer, roomId: payload.roomId });
    };

    const handleVoiceOffer = async (payload: { callerId: string; offer: RTCSessionDescriptionInit; roomId: string }) => {
      if (payload.callerId === socket.id) return;

      const pc = createPeerConnection(payload.callerId, payload.roomId);
      await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socket.emit('voice:answer', { targetId: payload.callerId, answer, roomId: payload.roomId });
    };

    const handleVoiceAnswer = async (payload: { answererId: string; answer: RTCSessionDescriptionInit }) => {
      const pc = peerConnectionsRef.current[payload.answererId];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
      }
    };

    const handleIceCandidate = async (payload: { senderId: string; candidate: RTCIceCandidateInit }) => {
      const pc = peerConnectionsRef.current[payload.senderId];
      if (pc && payload.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (e) {
          console.warn('addIceCandidate error', e);
        }
      }
    };

    const handleMemberLeft = (payload: { socketId: string; userId: string }) => {
      if (peerConnectionsRef.current[payload.socketId]) {
        try {
          peerConnectionsRef.current[payload.socketId].close();
        } catch (_) {}
        delete peerConnectionsRef.current[payload.socketId];
      }
      setRemoteStreams(prev => {
        if (!prev[payload.socketId]) return prev;
        const copy = { ...prev };
        delete copy[payload.socketId];
        return copy;
      });
    };

    socket.on('room:member_joined', handleRoomJoin);
    socket.on('room:member_left', handleMemberLeft);
    socket.on('voice:offer', handleVoiceOffer);
    socket.on('voice:answer', handleVoiceAnswer);
    socket.on('voice:ice-candidate', handleIceCandidate);

    return () => {
      socket.off('room:member_joined', handleRoomJoin);
      socket.off('room:member_left', handleMemberLeft);
      socket.off('voice:offer', handleVoiceOffer);
      socket.off('voice:answer', handleVoiceAnswer);
      socket.off('voice:ice-candidate', handleIceCandidate);
    };
  }, [socket, connected, createPeerConnection]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      leaveVoiceRoom();
    };
  }, [leaveVoiceRoom]);

  const toggleMute = useCallback(async () => {
    setPermissionError(null);

    // If currently unmuted -> mute
    if (!isMuted) {
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => {
          t.enabled = false;
        });
      }
      setIsMuted(true);
      return;
    }

    // If currently muted -> unmute
    // Case A: Stream already acquired and active
    const existingTrack = localStreamRef.current?.getAudioTracks().find(t => t.readyState === 'live');
    if (existingTrack) {
      existingTrack.enabled = true;
      setIsMuted(false);
      return;
    }

    // Case B: Request microphone stream on explicit user action (button click)
    setIsMicInitializing(true);
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Ваш браузер не підтримує аудіо.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      localStreamRef.current = stream;
      stream.getAudioTracks().forEach(t => {
        t.enabled = true;
      });

      const audioTrack = stream.getAudioTracks()[0];

      // Attach track to all existing peer connections
      for (const pc of Object.values(peerConnectionsRef.current)) {
        try {
          const senders = pc.getSenders();
          const audioSender = senders.find(s => !s.track || s.track.kind === 'audio');
          if (audioSender) {
            await audioSender.replaceTrack(audioTrack);
          } else {
            pc.addTrack(audioTrack, stream);
          }
        } catch (pcErr) {
          console.error('Failed to attach audio track to peer', pcErr);
        }
      }

      try {
        localStorage.setItem('viberoom_mic_granted', 'true');
      } catch (_) {}

      setIsMuted(false);
    } catch (err: any) {
      console.error('Failed to get microphone access', err);
      let msg = 'Не вдалося отримати доступ до мікрофона.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Доступ до мікрофона заблоковано в налаштуваннях. Будь ласка, дозвольте доступ у браузері.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Мікрофон не знайдено на вашому пристрої.';
      }
      setPermissionError(msg);
      setIsMuted(true);
    } finally {
      setIsMicInitializing(false);
    }
  }, [isMuted]);

  return (
    <VoiceContext.Provider
      value={{
        isMuted,
        isMicInitializing,
        permissionError,
        toggleMute,
        remoteStreams,
        leaveVoiceRoom,
      }}
    >
      {children}
      {Object.entries(remoteStreams).map(([id, stream]) => (
        <audio
          key={id}
          autoPlay
          playsInline
          ref={el => {
            if (el && el.srcObject !== stream) {
              el.srcObject = stream;
              el.play().catch(() => {});
            }
          }}
        />
      ))}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const context = useContext(VoiceContext);
  if (context === undefined) {
    throw new Error('useVoice must be used within a VoiceProvider');
  }
  return context;
}
