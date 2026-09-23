import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BotService } from '../bot/bot.service';

@Injectable()
export class FriendsService {
  constructor(
    private prisma: PrismaService,
    private botService: BotService,
  ) {}

  async getFriends(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        userId,
      },
      include: {
        friend: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarUrl: true,
            telegramId: true,
            memberships: {
              select: {
                roomId: true,
                room: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
              take: 1,
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return friendships.map((f) => ({
      id: f.friend.id,
      displayName: f.friend.displayName,
      username: f.friend.username,
      avatarUrl: f.friend.avatarUrl,
      currentRoom: f.friend.memberships[0]?.room || null,
      friendSince: f.createdAt,
    }));
  }

  async addFriend(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException('Не можна додати самого себе в друзі');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException('Користувача не знайдено');
    }

    // Mutual friendship: add in both directions
    await this.prisma.$transaction([
      this.prisma.friendship.upsert({
        where: {
          userId_friendId: {
            userId,
            friendId: targetUserId,
          },
        },
        create: {
          userId,
          friendId: targetUserId,
        },
        update: {},
      }),
      this.prisma.friendship.upsert({
        where: {
          userId_friendId: {
            userId: targetUserId,
            friendId: userId,
          },
        },
        create: {
          userId: targetUserId,
          friendId: userId,
        },
        update: {},
      }),
    ]);

    return { success: true, message: 'Друга додано успішно' };
  }

  async removeFriend(userId: string, targetUserId: string) {
    await this.prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId, friendId: targetUserId },
          { userId: targetUserId, friendId: userId },
        ],
      },
    });

    return { success: true, message: 'Видалено з друзів' };
  }

  async isFriend(userId: string, targetUserId: string): Promise<boolean> {
    const friendship = await this.prisma.friendship.findUnique({
      where: {
        userId_friendId: {
          userId,
          friendId: targetUserId,
        },
      },
    });
    return !!friendship;
  }

  async inviteFriendToRoom(userId: string, targetUserId: string, roomId: string) {
    const [sender, friend, room] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.user.findUnique({ where: { id: targetUserId } }),
      this.prisma.room.findUnique({ where: { id: roomId } }),
    ]);

    if (!sender || !friend || !room) {
      throw new NotFoundException('Дані для запрошення не знайдено');
    }

    if (!friend.telegramId) {
      return {
        success: false,
        message: 'У друга не налаштовано Telegram ID для сповіщень',
      };
    }

    const sent = await this.botService.sendRoomInviteNotification(
      sender.displayName,
      friend.telegramId,
      room.title,
      room.id,
    );

    return {
      success: sent,
      message: sent
        ? 'Сповіщення успішно надіслано в Telegram!'
        : 'Не вдалося надіслати сповіщення (можливо, бот заблокований користувачем)',
    };
  }
}
