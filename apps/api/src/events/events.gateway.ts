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
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private eventsService: EventsService,
    private usersService: UsersService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth.token ||
        client.handshake.headers['authorization']?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }
      const secret =
        this.configService.get<string>('JWT_SECRET') ||
        'viberoom_jwt_default_secret_key_change_me';
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

  async handleDisconnect(client: Socket) {
    const roomId = client.data.roomId;
    const user = client.data.user;

    if (roomId && user) {
      await this.handleMemberExit(roomId, user, client.id);
    }
  }

  private async handleMemberExit(roomId: string, user: any, socketId: string) {
    if (!roomId || !user) return;

    try {
      // 1. Remove this user from the room's members
      await this.prisma.roomMember.deleteMany({
        where: { roomId, userId: user.id },
      }).catch(() => {});

      // 2. Fetch remaining members in the room
      const remainingMembers = await this.prisma.roomMember.findMany({
        where: { roomId },
        include: { user: true },
      });

      // 3. If NO members left in room: DELETE THE ROOM IMMEDIATELY
      if (remainingMembers.length === 0) {
        this.logger.log(`Room ${roomId} has 0 members left. Deleting room immediately.`);
        this.server.to(roomId).emit('room:deleted');
        await this.prisma.roomMember.deleteMany({ where: { roomId } }).catch(() => {});
        await this.prisma.message.deleteMany({ where: { roomId } }).catch(() => {});
        await this.prisma.invitation.deleteMany({ where: { roomId } }).catch(() => {});
        await this.prisma.room.delete({ where: { id: roomId } }).catch((e) => {
          this.logger.error(`Error deleting room ${roomId}: ${e.message}`);
        });
        return;
      }

      // 4. If there ARE remaining members: check if leaving user was the OWNER
      const room = await this.prisma.room.findUnique({ where: { id: roomId } });
      if (room && room.ownerId === user.id) {
        // Pick a random remaining member to become the new OWNER
        const randomIndex = Math.floor(Math.random() * remainingMembers.length);
        const newHost = remainingMembers[randomIndex];

        await this.prisma.$transaction([
          this.prisma.room.update({
            where: { id: roomId },
            data: { ownerId: newHost.userId, updatedAt: new Date() },
          }),
          this.prisma.roomMember.updateMany({
            where: { roomId, userId: { not: newHost.userId } },
            data: { role: 'MEMBER' },
          }),
          this.prisma.roomMember.update({
            where: { id: newHost.id },
            data: { role: 'OWNER' },
          }),
        ]);

        this.logger.log(
          `Host ${user.displayName} left room ${roomId}. Transferred host to ${newHost.user.displayName}`,
        );

        // Re-fetch members to reflect role update
        const updatedMembers = await this.prisma.roomMember.findMany({
          where: { roomId },
          include: { user: true },
        });

        this.server.to(roomId).emit('room:host_transferred', {
          newHostId: newHost.userId,
          newHostName: newHost.user.displayName,
        });
        this.server.to(roomId).emit('room:members_updated', updatedMembers);
      } else {
        // Just touch updatedAt and broadcast updated members
        await this.prisma.room.update({
          where: { id: roomId },
          data: { updatedAt: new Date() },
        }).catch(() => {});

        this.server.to(roomId).emit('room:members_updated', remainingMembers);
      }

      this.server.to(roomId).emit('room:member_left', {
        socketId,
        userId: user.id,
        roomId,
      });
    } catch (err: any) {
      this.logger.error(`Error in handleMemberExit for room ${roomId}: ${err.message}`);
    }
  }

  @SubscribeMessage('room:join')
  async handleRoomJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ) {
    const { roomId } = payload;
    client.join(roomId);
    client.data.roomId = roomId;

    const user = client.data.user;
    if (user) {
      try {
        const room = await this.prisma.room.findUnique({ where: { id: roomId } });
        if (!room) {
          client.emit('room:not_found');
          return;
        }

        const isOwner = room.ownerId === user.id;

        // Ensure user is registered as member in database
        const existingMember = await this.prisma.roomMember.findUnique({
          where: { roomId_userId: { roomId, userId: user.id } },
        });

        if (!existingMember) {
          await this.prisma.roomMember.create({
            data: {
              roomId,
              userId: user.id,
              role: isOwner ? 'OWNER' : 'MEMBER',
            },
          }).catch(() => {});
        }

        // Touch room updatedAt
        await this.prisma.room.update({
          where: { id: roomId },
          data: { updatedAt: new Date() },
        }).catch(() => {});

        // WebRTC peer notification
        client.to(roomId).emit('room:member_joined', {
          socketId: client.id,
          userId: user.id,
          roomId,
        });

        // Broadcast full updated members list to the entire room
        const members = await this.prisma.roomMember.findMany({
          where: { roomId },
          include: { user: true },
        });
        this.server.to(roomId).emit('room:members_updated', members);
      } catch (err: any) {
        this.logger.error(`Error in handleRoomJoin: ${err.message}`);
      }
    }

    // Send current playback state to newly joined user
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
    client.data.roomId = null;

    const user = client.data.user;
    if (user) {
      await this.handleMemberExit(roomId, user, client.id);
    }
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
        roomId_userId: {
          userId: user.id,
          roomId,
        },
      },
    });

    if (membership?.role !== 'OWNER') {
      return;
    }

    await this.eventsService.setPlaybackState(roomId, state);
    await this.prisma.room.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    }).catch(() => {});

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
          select: { id: true, displayName: true, username: true, avatarUrl: true },
        },
      },
    });

    // Touch room updatedAt
    await this.prisma.room.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    }).catch(() => {});

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

    client.to(payload.roomId).emit('voice:offer', {
      callerId: client.id,
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
