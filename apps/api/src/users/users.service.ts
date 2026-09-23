import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@viberoom/database';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByTelegramId(telegramId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { telegramId },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async createOrUpdateTelegramUser(data: {
    telegramId: string;
    username?: string;
    displayName: string;
    avatarUrl?: string;
  }): Promise<User> {
    const existing = await this.findByTelegramId(data.telegramId);

    if (existing) {
      return this.prisma.user.update({
        where: { telegramId: data.telegramId },
        data: {
          username: data.username,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
        },
      });
    }

    return this.prisma.user.create({
      data: {
        telegramId: data.telegramId,
        username: data.username,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
      },
    });
  }
}
