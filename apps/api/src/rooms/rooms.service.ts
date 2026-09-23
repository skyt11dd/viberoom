import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createRoomDto: CreateRoomDto) {
    const room = await this.prisma.room.create({
      data: {
        title: createRoomDto.title,
        privacy: createRoomDto.privacy || 'PUBLIC',
        ownerId: userId,
        members: {
          create: {
            userId: userId,
            role: 'OWNER',
          },
        },
      },
      include: {
        owner: true,
      },
    });

    return room;
  }

  async findOne(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        owner: true,
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException(`Room with ID ${id} not found`);
    }

    return room;
  }

  async remove(userId: string, id: string) {
    const room = await this.findOne(id);
    if (room.ownerId !== userId) {
      throw new ForbiddenException('Only the owner can delete the room');
    }

    // Delete members first due to foreign key constraints
    await this.prisma.roomMember.deleteMany({
      where: { roomId: id },
    });

    await this.prisma.room.delete({
      where: { id },
    });

    return { success: true };
  }

  async joinRoom(userId: string, roomId: string) {
    const room = await this.findOne(roomId);

    const existingMember = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: userId,
        },
      },
    });

    if (existingMember) {
      return existingMember; // Already joined
    }

    return this.prisma.roomMember.create({
      data: {
        roomId: room.id,
        userId: userId,
        role: 'MEMBER',
      },
      include: {
        user: true,
      },
    });
  }

  async leaveRoom(userId: string, roomId: string) {
    const existingMember = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: roomId,
          userId: userId,
        },
      },
    });

    if (!existingMember) {
      throw new NotFoundException('User is not a member of this room');
    }

    await this.prisma.roomMember.delete({
      where: { id: existingMember.id },
    });

    return { success: true };
  }

  async getMembers(roomId: string) {
    const members = await this.prisma.roomMember.findMany({
      where: { roomId },
      include: { user: true },
    });
    return members;
  }
}
