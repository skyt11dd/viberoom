import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Start, Update, Ctx } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';

@Update()
@Injectable()
export class BotService {
  constructor(private configService: ConfigService) {}

  @Start()
  async startCommand(@Ctx() ctx: Context) {
    const webAppUrl = this.configService.get<string>('FRONTEND_URL') || 'https://example.com';
    // Deep links pass args, e.g. /start room_123 -> args = "room_123"
    // @ts-ignore - context payload exists in telegraf StartCtx
    const args = ctx.payload;

    let message = 'Welcome to VibeRoom! 🎬\n\nWatch videos together with your friends in real-time. Tap the button below to open the app!';
    
    if (args && args.startsWith('room_')) {
      message = 'You have been invited to a VibeRoom! 🍿\n\nTap the button below to join the room and watch together.';
    }

    await ctx.reply(
      message,
      Markup.inlineKeyboard([
        Markup.button.webApp(args && args.startsWith('room_') ? 'Join Room' : 'Open VibeRoom', webAppUrl),
      ])
    );
  }
}
