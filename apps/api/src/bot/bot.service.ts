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
    const webAppUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('TELEGRAM_WEBAPP_URL') ||
      'https://example.com';
    // Deep links pass args, e.g. /start room_123 -> args = "room_123"
    // @ts-ignore - context payload exists in telegraf StartCtx
    const args = ctx.payload;

    let message =
      '🎬 *Ласкаво просимо до VIBEROOM!*\n\n' +
      'Дивіться відео разом із друзями в реальному часі, слухайте музику та спілкуйтеся голосом.\n\n' +
      'Натисніть кнопку нижче, щоб відкрити додаток!';
    let buttonLabel = '🚀 Відкрити VIBEROOM';
    let url = webAppUrl;

    if (args && args.startsWith('room_')) {
      message =
        '🍿 *Вас запросили до кімнати у VIBEROOM!*\n\n' +
        'Приєднуйтесь до спільного перегляду просто зараз.';
      buttonLabel = '🎉 Приєднатися до кімнати';
      url = `${webAppUrl}?startapp=${args}`;
    }

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([Markup.button.webApp(buttonLabel, url)]),
    });
  }
}
