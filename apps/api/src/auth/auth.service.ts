import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateTelegramWebAppData(initData: string): Promise<any> {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.error('TELEGRAM_BOT_TOKEN is not configured in server environment!');
      throw new BadRequestException('Server error: TELEGRAM_BOT_TOKEN is not configured');
    }

    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) {
      this.logger.warn('No hash provided in initData');
      throw new UnauthorizedException('No hash provided in Telegram initData');
    }
    urlParams.delete('hash');

    const paramsArray = Array.from(urlParams.entries());
    paramsArray.sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = paramsArray.map(([key, value]) => `${key}=${value}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      this.logger.warn(`Invalid Telegram initData hash. calculated=${calculatedHash} received=${hash}`);
      throw new UnauthorizedException('Invalid Telegram initData (token or hash mismatch)');
    }

    const userStr = urlParams.get('user');
    if (!userStr) {
      this.logger.warn('No user data in initData');
      throw new UnauthorizedException('No user data in Telegram initData');
    }

    try {
      const userObj = JSON.parse(userStr);
      return userObj;
    } catch (e) {
      this.logger.warn('Failed to parse user JSON from initData');
      throw new UnauthorizedException('Failed to parse user data');
    }
  }

  async loginTelegram(initData: string) {
    try {
      const tgUser = await this.validateTelegramWebAppData(initData);

      const user = await this.usersService.createOrUpdateTelegramUser({
        telegramId: tgUser.id.toString(),
        username: tgUser.username,
        displayName: tgUser.first_name + (tgUser.last_name ? ` ${tgUser.last_name}` : ''),
        avatarUrl: tgUser.photo_url,
      });

      const payload = { sub: user.id, username: user.username };
      return {
        access_token: this.jwtService.sign(payload),
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
      };
    } catch (err: any) {
      this.logger.error(`Telegram auth failed: ${err.message}`, err.stack);
      if (err instanceof HttpException) {
        throw err;
      }
      throw new InternalServerErrorException(`Telegram auth error: ${err.message}`);
    }
  }
}

