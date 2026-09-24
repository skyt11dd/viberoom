import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { RoomsModule } from './rooms/rooms.module';
import { EventsModule } from './events/events.module';
import { RedisModule } from './redis/redis.module';
import { TelegrafModule } from 'nestjs-telegraf';
import { BotModule } from './bot/bot.module';
import { FriendsModule } from './friends/friends.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100, // 100 requests per minute
    }]),
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const token = configService.get<string>('TELEGRAM_BOT_TOKEN');
        const isValidToken =
          token && token !== 'dummy_token' && token !== 'your_telegram_bot_token';

        if (isValidToken) {
          try {
            // Delete any existing webhook to ensure Telegram delivers updates via polling
            const { Telegraf } = await import('telegraf');
            const tempBot = new Telegraf(token);
            await tempBot.telegram.deleteWebhook({ drop_pending_updates: false });
            console.log('✅ Cleaned up old Telegram webhook before launching polling');
          } catch (e: any) {
            console.warn('⚠️ Could not clean up webhook before launch:', e.message);
          }
        }

        return {
          token: token || 'dummy_token',
          launchOptions: isValidToken ? { dropPendingUpdates: false } : false,
        };
      },
      inject: [ConfigService],
    }),
    PrismaModule,
    RedisModule,
    UsersModule,
    AuthModule,
    RoomsModule,
    EventsModule,
    BotModule,
    FriendsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    }
  ],
})
export class AppModule {}
