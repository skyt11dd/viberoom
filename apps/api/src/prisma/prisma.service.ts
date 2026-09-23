import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@viberoom/database';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to PostgreSQL database successfully.');

      try {
        const count = await this.user.count();
        this.logger.log(`Database tables verified. Total users: ${count}`);
      } catch (tableErr: any) {
        this.logger.error(
          `WARNING: User table check failed (${tableErr.message}). ` +
          `Tables may not exist in database yet. Ensure schema push succeeded.`
        );
      }
    } catch (err: any) {
      this.logger.error(`Prisma connection failed: ${err.message}`, err.stack);
    }
  }
}
