import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Start, Update, Ctx, InjectBot } from 'nestjs-telegraf';
import { Context, Markup, Telegraf } from 'telegraf';

@Update()
@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private configService: ConfigService,
    @InjectBot() private bot: Telegraf<Context>,
  ) {}

  @Start()
  async startCommand(@Ctx() ctx: Context) {
    const webAppUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('TELEGRAM_WEBAPP_URL') ||
      'https://example.com';

    // Deep links pass args, e.g. /start room_123 -> args = "room_123"
    // @ts-ignore
    const args = ctx.payload;

    if (args && args.startsWith('room_')) {
      const inviteUrl = `${webAppUrl}?startapp=${args}`;
      const inviteMsg =
        '🍿 *Вас запросили до VIBEROOM!* 🍿\n\n' +
        '🎬 Ваш друг чекає на вас у кімнаті для спільного перегляду!\n' +
        '🎙️ Спілкуйтеся голосом, коментуйте в живому чаті та дивіться відео разом.\n\n' +
        'Тисніть кнопку нижче, щоб зайти прямо зараз! 👇';

      await ctx.reply(inviteMsg, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          Markup.button.webApp('🎉 Приєднатися до кімнати', inviteUrl),
        ]),
      });
      return;
    }

    const welcomeMsg =
      '✨ *Ласкаво просимо до VIBEROOM!* ✨\n\n' +
      '🎬 *Дивіться відео разом:* синхронний перегляд YouTube без затримок\n' +
      '🎙️ *Голосовий звʼязок:* спілкуйтеся з друзями в реальному часі\n' +
      '💬 *Живий чат:* обговорюйте та надсилайте реакції\n' +
      '👥 *Система друзів:* кличте друзів у кімнату в один клік\n\n' +
      'Тисніть кнопку нижче, щоб розпочати вечірку! 👇';

    await ctx.reply(welcomeMsg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        Markup.button.webApp('🚀 Відкрити VIBEROOM', webAppUrl),
      ]),
    });
  }

  async sendRoomInviteNotification(
    senderName: string,
    recipientTelegramId: string,
    roomTitle: string,
    roomId: string,
  ): Promise<boolean> {
    const webAppUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('TELEGRAM_WEBAPP_URL') ||
      'https://example.com';
    const roomUrl = `${webAppUrl}?startapp=room_${roomId}`;

    const text =
      `🔔 *Запрошення у VIBEROOM!*\n\n` +
      `🍿 Користувач *${senderName}* кличе вас дивитися відео разом у кімнаті:\n` +
      `🎬 *«${roomTitle}»*\n\n` +
      `Тисніть кнопку нижче, щоб увійти! 👇`;

    try {
      await this.bot.telegram.sendMessage(recipientTelegramId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [Markup.button.webApp('🍿 Приєднатися до кімнати', roomUrl)],
          ],
        },
      });
      return true;
    } catch (err: any) {
      this.logger.warn(
        `Failed to send telegram bot notification to ${recipientTelegramId}: ${err.message}`,
      );
      return false;
    }
  }
}
