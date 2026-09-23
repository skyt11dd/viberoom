import { Injectable, NotFoundException, ForbiddenException, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';

@Injectable()
export class RoomsService implements OnModuleInit {
  private readonly logger = new Logger(RoomsService.name);

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    // Run cleanup every 60 seconds to purge rooms inactive for > 5 minutes
    setInterval(() => {
      this.cleanupInactiveRooms().catch((err) => {
        this.logger.error(`Periodic room cleanup error: ${err.message}`);
      });
    }, 60000);
  }

  async cleanupInactiveRooms() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    try {
      const inactiveRooms = await this.prisma.room.findMany({
        where: {
          updatedAt: { lt: fiveMinutesAgo },
          members: { none: {} },
        },
        select: { id: true },
      });

      if (inactiveRooms.length > 0) {
        this.logger.log(`Purging ${inactiveRooms.length} inactive rooms empty for > 5 minutes...`);
        for (const room of inactiveRooms) {
          await this.prisma.message.deleteMany({ where: { roomId: room.id } }).catch(() => {});
          await this.prisma.invitation.deleteMany({ where: { roomId: room.id } }).catch(() => {});
          await this.prisma.room.delete({ where: { id: room.id } }).catch(() => {});
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to cleanup inactive rooms: ${err.message}`);
    }
  }

  async findAllActive() {
    // Cleanup any lingering empty rooms
    await this.cleanupInactiveRooms();

    return this.prisma.room.findMany({
      where: {
        privacy: 'PUBLIC',
      },
      include: {
        owner: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarUrl: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });
  }

  async getUserStats(userId: string) {
    const [roomsCreated, roomsJoined] = await Promise.all([
      this.prisma.room.count({ where: { ownerId: userId } }),
      this.prisma.roomMember.count({ where: { userId } }),
    ]);

    return {
      roomsCreated,
      roomsJoined,
    };
  }

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

    // Delete related entities first
    await this.prisma.message.deleteMany({ where: { roomId: id } });
    await this.prisma.invitation.deleteMany({ where: { roomId: id } });
    await this.prisma.roomMember.deleteMany({ where: { roomId: id } });
    await this.prisma.room.delete({ where: { id } });

    return { success: true };
  }

  async joinRoom(userId: string, roomId: string) {
    const room = await this.findOne(roomId);

    // Update room updatedAt to keep it active
    await this.prisma.room.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    }).catch(() => {});

    const existingMember = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: userId,
        },
      },
    });

    if (existingMember) {
      return existingMember;
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
      return { success: true };
    }

    await this.prisma.roomMember.delete({
      where: { id: existingMember.id },
    });

    // Touch room updatedAt
    await this.prisma.room.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    }).catch(() => {});

    return { success: true };
  }

  async getMembers(roomId: string) {
    return this.prisma.roomMember.findMany({
      where: { roomId },
      include: { user: true },
    });
  }
}
