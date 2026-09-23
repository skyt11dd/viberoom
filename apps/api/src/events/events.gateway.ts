import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventsService } from './events.service';
import { PlaybackState } from '@viberoom/shared';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: '*', // Restrict this in production
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private eventsService: EventsService,
    private usersService: UsersService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers['authorization']?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }
      const secret = this.configService.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify(token, { secret });
      const user = await this.usersService.findById(payload.sub);
      
      if (!user) {
        client.disconnect();
        return;
      }
      
      client.data.user = user;
    } catch (error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // Optionally handle cleanup or presence state
  }

  @SubscribeMessage('room:join')
  async handleRoomJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ) {
    const { roomId } = payload;
    client.join(roomId);

    const user = client.data.user;
    if (user) {
      // Notify others in the room for WebRTC peering
      client.to(roomId).emit('room:member_joined', {
        socketId: client.id,
        userId: user.id,
        roomId,
      });
    }

    // Send current playback state to the newly joined user
    const state = await this.eventsService.getPlaybackState(roomId);
    if (state) {
      client.emit('room:resync', state);
    }
  }

  @SubscribeMessage('room:leave')
  async handleRoomLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ) {
    const { roomId } = payload;
    client.leave(roomId);
  }

  @SubscribeMessage('video:state')
  async handleVideoState(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; state: PlaybackState },
  ) {
    const { roomId, state } = payload;
    const user = client.data.user;
    if (!user) return;
    
    // Verify if user is OWNER
    const membership = await this.prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: user.id,
          roomId,
        }
      }
    });

    if (membership?.role !== 'OWNER') {
      // Ignore unauthorized sync attempts
      return;
    }

    await this.eventsService.setPlaybackState(roomId, state);
    
    // Broadcast to others in the room
    client.to(roomId).emit('video:sync', state);
  }

  @SubscribeMessage('chat:send')
  async handleChatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; text: string },
  ) {
    const { roomId, text } = payload;
    const user = client.data.user;

    if (!user || !text || typeof text !== 'string') return;
    
    const trimmedText = text.trim();
    if (!trimmedText || trimmedText.length > 500) {
      // Ignore empty messages or messages that are too long
      return;
    }

    const message = await this.prisma.message.create({
      data: {
        roomId,
        userId: user.id,
        text: trimmedText,
      },
      include: {
        user: {
          select: { id: true, displayName: true, avatarUrl: true }
        },
      },
    });

    this.server.to(roomId).emit('chat:receive', message);
  }

  @SubscribeMessage('chat:react')
  handleChatReact(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; emoji: string },
  ) {
    const { roomId, emoji } = payload;
    const user = client.data.user;
    
    if (!user) return;

    // Reactions are ephemeral, don't store in DB, just broadcast
    client.to(roomId).emit('chat:reaction', {
      emoji,
      userId: user.id,
      displayName: user.displayName,
      id: Math.random().toString(36).substr(2, 9),
    });
  }

  // WebRTC Signaling Events
  @SubscribeMessage('voice:offer')
  handleVoiceOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { targetId: string; offer: any; roomId: string },
  ) {
    const user = client.data.user;
    if (!user) return;
    
    // Relay offer to the specific target
    client.to(payload.roomId).emit('voice:offer', {
      callerId: client.id, // Socket ID of caller
      callerUserId: user.id,
      offer: payload.offer,
    });
  }

  @SubscribeMessage('voice:answer')
  handleVoiceAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { targetId: string; answer: any; roomId: string },
  ) {
    const user = client.data.user;
    if (!user) return;
    
    client.to(payload.targetId).emit('voice:answer', {
      answererId: client.id,
      answer: payload.answer,
    });
  }

  @SubscribeMessage('voice:ice-candidate')
  handleVoiceIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { targetId: string; candidate: any; roomId: string },
  ) {
    const user = client.data.user;
    if (!user) return;
    
    client.to(payload.targetId).emit('voice:ice-candidate', {
      senderId: client.id,
      candidate: payload.candidate,
    });
  }
}
