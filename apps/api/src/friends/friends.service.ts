import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BotService } from '../bot/bot.service';

@Injectable()
export class FriendsService {
  private readonly logger = new Logger(FriendsService.name);

  constructor(
    private prisma: PrismaService,
    private botService: BotService,
  ) {}

  private get friendshipDelegate() {
    return (this.prisma as any).friendship;
  }

  private get friendRequestDelegate() {
    return (this.prisma as any).friendRequest;
  }

  /**
   * Get all confirmed mutual friends
   */
  async getFriends(userId: string) {
    const friendships = await this.friendshipDelegate.findMany({
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

    return (friendships || []).map((f: any) => ({
      id: f.friend.id,
      displayName: f.friend.displayName,
      username: f.friend.username,
      avatarUrl: f.friend.avatarUrl,
      currentRoom: f.friend.memberships?.[0]?.room || null,
      friendSince: f.createdAt,
    }));
  }

  /**
   * Get incoming and outgoing pending friend requests
   */
  async getFriendRequests(userId: string) {
    const [incoming, outgoing] = await Promise.all([
      this.friendRequestDelegate.findMany({
        where: {
          receiverId: userId,
          status: 'PENDING',
        },
        include: {
          sender: {
            select: {
              id: true,
              displayName: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.friendRequestDelegate.findMany({
        where: {
          senderId: userId,
          status: 'PENDING',
        },
        include: {
          receiver: {
            select: {
              id: true,
              displayName: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    return {
      incoming: (incoming || []).map((r: any) => ({
        id: r.id,
        sender: r.sender,
        createdAt: r.createdAt,
      })),
      outgoing: (outgoing || []).map((r: any) => ({
        id: r.id,
        receiver: r.receiver,
        createdAt: r.createdAt,
      })),
    };
  }

  /**
   * Get friendship status between current user and target user
   */
  async getFriendshipStatus(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      return { status: 'SELF' };
    }

    // Check confirmed friendship
    const friendship = await this.friendshipDelegate.findUnique({
      where: {
        userId_friendId: {
          userId,
          friendId: targetUserId,
        },
      },
    });

    if (friendship) {
      return { status: 'FRIENDS' };
    }

    // Check outgoing pending request
    const outgoing = await this.friendRequestDelegate.findUnique({
      where: {
        senderId_receiverId: {
          senderId: userId,
          receiverId: targetUserId,
        },
      },
    });

    if (outgoing && outgoing.status === 'PENDING') {
      return { status: 'OUTGOING_REQUEST', requestId: outgoing.id };
    }

    // Check incoming pending request
    const incoming = await this.friendRequestDelegate.findUnique({
      where: {
        senderId_receiverId: {
          senderId: targetUserId,
          receiverId: userId,
        },
      },
    });

    if (incoming && incoming.status === 'PENDING') {
      return { status: 'INCOMING_REQUEST', requestId: incoming.id };
    }

    return { status: 'NONE' };
  }

  /**
   * Send a friend request (requires acceptance from target)
   */
  async sendFriendRequest(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException('Не можна надіслати заявку самому собі');
    }

    const [sender, targetUser] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.user.findUnique({ where: { id: targetUserId } }),
    ]);

    if (!targetUser || !sender) {
      throw new NotFoundException('Користувача не знайдено');
    }

    // 1. Are they already confirmed friends?
    const existingFriendship = await this.friendshipDelegate.findUnique({
      where: {
        userId_friendId: {
          userId,
          friendId: targetUserId,
        },
      },
    });

    if (existingFriendship) {
      return { status: 'ALREADY_FRIENDS', message: 'Ви вже є друзями' };
    }

    // 2. Did target already send ME a request? If so, auto-accept mutual friendship!
    const incomingRequest = await this.friendRequestDelegate.findUnique({
      where: {
        senderId_receiverId: {
          senderId: targetUserId,
          receiverId: userId,
        },
      },
    });

    if (incomingRequest && incomingRequest.status === 'PENDING') {
      // Auto-accept!
      await this.acceptFriendRequest(userId, incomingRequest.id);
      return {
        status: 'ACCEPTED',
        message: 'Користувач вже надсилав вам заявку — тепер ви друзі!',
      };
    }

    // 3. Did I already send a pending request?
    const outgoingRequest = await this.friendRequestDelegate.findUnique({
      where: {
        senderId_receiverId: {
          senderId: userId,
          receiverId: targetUserId,
        },
      },
    });

    if (outgoingRequest && outgoingRequest.status === 'PENDING') {
      return { status: 'ALREADY_REQUESTED', message: 'Заявку вже надіслано раніше' };
    }

    // 4. Create new pending friend request
    await this.friendRequestDelegate.upsert({
      where: {
        senderId_receiverId: {
          senderId: userId,
          receiverId: targetUserId,
        },
      },
      create: {
        senderId: userId,
        receiverId: targetUserId,
        status: 'PENDING',
      },
      update: {
        status: 'PENDING',
      },
    });

    // 5. Send Telegram bot notification if targetUser has telegramId
    if (targetUser.telegramId) {
      this.botService
        .sendFriendRequestNotification(sender.displayName, targetUser.telegramId)
        .catch((err) => this.logger.warn(`Could not send friend request bot notification: ${err.message}`));
    }

    return { status: 'PENDING', message: 'Заявку в друзі надіслано!' };
  }

  /**
   * Accept an incoming friend request
   */
  async acceptFriendRequest(userId: string, requestId: string) {
    const request = await this.friendRequestDelegate.findUnique({
      where: { id: requestId },
      include: {
        sender: true,
        receiver: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Заявку не знайдено');
    }

    if (request.receiverId !== userId) {
      throw new BadRequestException('Ви не можете прийняти чужу заявку');
    }

    // Create mutual friendship in both directions and delete friend request
    await this.prisma.$transaction([
      this.friendshipDelegate.upsert({
        where: {
          userId_friendId: {
            userId: request.receiverId,
            friendId: request.senderId,
          },
        },
        create: {
          userId: request.receiverId,
          friendId: request.senderId,
        },
        update: {},
      }),
      this.friendshipDelegate.upsert({
        where: {
          userId_friendId: {
            userId: request.senderId,
            friendId: request.receiverId,
          },
        },
        create: {
          userId: request.senderId,
          friendId: request.receiverId,
        },
        update: {},
      }),
      this.friendRequestDelegate.delete({
        where: { id: requestId },
      }),
    ]);

    // Send Telegram notification to the sender that request was accepted
    if (request.sender?.telegramId) {
      this.botService
        .sendFriendAcceptedNotification(request.receiver.displayName, request.sender.telegramId)
        .catch((err) => this.logger.warn(`Could not send friend accepted bot notification: ${err.message}`));
    }

    return { success: true, message: 'Заявку прийнято! Тепер ви друзі' };
  }

  /**
   * Decline an incoming friend request
   */
  async declineFriendRequest(userId: string, requestId: string) {
    const request = await this.friendRequestDelegate.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Заявку не знайдено');
    }

    if (request.receiverId !== userId) {
      throw new BadRequestException('Ви не можете відхилити чужу заявку');
    }

    await this.friendRequestDelegate.delete({
      where: { id: requestId },
    });

    return { success: true, message: 'Заявку відхилено' };
  }

  /**
   * Cancel an outgoing friend request
   */
  async cancelFriendRequest(userId: string, requestId: string) {
    const request = await this.friendRequestDelegate.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Заявку не знайдено');
    }

    if (request.senderId !== userId) {
      throw new BadRequestException('Ви можете скасувати лише власну надіслану заявку');
    }

    await this.friendRequestDelegate.delete({
      where: { id: requestId },
    });

    return { success: true, message: 'Заявку скасовано' };
  }

  /**
   * Remove a confirmed friend
   */
  async removeFriend(userId: string, targetUserId: string) {
    await Promise.all([
      this.friendshipDelegate.deleteMany({
        where: {
          OR: [
            { userId, friendId: targetUserId },
            { userId: targetUserId, friendId: userId },
          ],
        },
      }),
      this.friendRequestDelegate.deleteMany({
        where: {
          OR: [
            { senderId: userId, receiverId: targetUserId },
            { senderId: targetUserId, receiverId: userId },
          ],
        },
      }),
    ]);

    return { success: true, message: 'Видалено з друзів' };
  }

  /**
   * Check if two users are confirmed friends
   */
  async isFriend(userId: string, targetUserId: string): Promise<boolean> {
    const friendship = await this.friendshipDelegate.findUnique({
      where: {
        userId_friendId: {
          userId,
          friendId: targetUserId,
        },
      },
    });
    return !!friendship;
  }

  /**
   * Invite a friend to a room with Telegram notification
   */
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
