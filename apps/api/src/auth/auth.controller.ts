import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TelegramAuthDto } from './dto/telegram-auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('telegram')
  async telegramLogin(@Body() authDto: TelegramAuthDto) {
    return this.authService.loginTelegram(authDto.initData);
  }

  @Post('google')
  async googleLogin() {
    // Stub for Google Auth Phase 2 requirement
    return { message: 'Google Auth not yet implemented' };
  }

  @Post('email')
  async emailLogin() {
    // Stub for Email Auth Phase 2 requirement
    return { message: 'Email Auth not yet implemented' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req: any) {
    return req.user;
  }
}
