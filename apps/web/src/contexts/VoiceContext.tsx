'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useSocket } from './SocketContext';

interface VoiceContextType {
  isMuted: boolean;
  toggleMute: () => void;
  remoteStreams: { [socketId: string]: MediaStream };
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { socket, connected } = useSocket();
  const [isMuted, setIsMuted] = useState(true);
  const [remoteStreams, setRemoteStreams] = useState<{ [id: string]: MediaStream }>({});
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<{ [id: string]: RTCPeerConnection }>({});
  
  const STUN_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  useEffect(() => {
    const initMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        
        // Mute by default initially
        stream.getAudioTracks().forEach(t => t.enabled = false);
      } catch (err) {
        console.error('Failed to get microphone access', err);
      }
    };
    initMic();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    };
  }, []);

  const createPeerConnection = (targetId: string, roomId: string) => {
    if (peerConnectionsRef.current[targetId]) return peerConnectionsRef.current[targetId];

    const pc = new RTCPeerConnection(STUN_SERVERS);
    peerConnectionsRef.current[targetId] = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('voice:ice-candidate', { targetId, candidate: event.candidate, roomId });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStreams(prev => ({
        ...prev,
        [targetId]: event.streams[0]
      }));
    };

    return pc;
  };

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
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    };

    // We need the backend to emit something like 'room:member_joined' with their socketId.
    // For now, let's assume EventsGateway handles it, or we rely on 'chat:receive' / presence events to trigger connections.
    socket.on('room:member_joined', handleRoomJoin);
    socket.on('voice:offer', handleVoiceOffer);
    socket.on('voice:answer', handleVoiceAnswer);
    socket.on('voice:ice-candidate', handleIceCandidate);

    return () => {
      socket.off('room:member_joined', handleRoomJoin);
      socket.off('voice:offer', handleVoiceOffer);
      socket.off('voice:answer', handleVoiceAnswer);
      socket.off('voice:ice-candidate', handleIceCandidate);
    };
  }, [socket, connected]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !t.enabled;
      });
      setIsMuted(!localStreamRef.current.getAudioTracks()[0].enabled);
    }
  };

  return (
    <VoiceContext.Provider value={{ isMuted, toggleMute, remoteStreams }}>
      {children}
      {Object.entries(remoteStreams).map(([id, stream]) => (
        <audio key={id} autoPlay ref={el => { if (el) el.srcObject = stream }} />
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
