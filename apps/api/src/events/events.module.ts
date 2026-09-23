import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [JwtModule, UsersModule, ConfigModule, PrismaModule],
  providers: [EventsGateway, EventsService],
  exports: [EventsGateway],
})
export class EventsModule {}
