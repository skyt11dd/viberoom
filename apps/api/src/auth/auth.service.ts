import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateTelegramWebAppData(initData: string): Promise<any> {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }

    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) {
      throw new UnauthorizedException('No hash provided in initData');
    }
    urlParams.delete('hash');

    const paramsArray = Array.from(urlParams.entries());
    paramsArray.sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = paramsArray.map(([key, value]) => `${key}=${value}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      throw new UnauthorizedException('Invalid Telegram initData');
    }

    const userStr = urlParams.get('user');
    if (!userStr) {
      throw new UnauthorizedException('No user data in initData');
    }

    try {
      const userObj = JSON.parse(userStr);
      return userObj;
    } catch (e) {
      throw new UnauthorizedException('Failed to parse user data');
    }
  }

  async loginTelegram(initData: string) {
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
  }
}
