import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Start, Update, Ctx, InjectBot } from 'nestjs-telegraf';
import { Context, Markup, Telegraf } from 'telegraf';

@Update()
@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private configService: ConfigService,
    @InjectBot() private bot: Telegraf<Context>,
  ) {}

  async onModuleInit() {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token || token === 'dummy_token' || token === 'your_telegram_bot_token') {
      this.logger.warn('⚠️ TELEGRAM_BOT_TOKEN is not set or placeholder. Bot listeners will be skipped.');
      return;
    }

    try {
      this.logger.log('🤖 Initializing Telegram Bot listeners...');
      const me = await this.bot.telegram.getMe();
      this.logger.log(`✅ Telegram bot connected as @${me.username} (${me.first_name})`);

    } catch (err: any) {
      this.logger.error(`⚠️ Bot init warning: ${err.message}`);
    }

    // Direct registration on Telegraf instance to ensure 100% reliability
    this.bot.start(async (ctx) => {
      this.logger.log(`📥 Received /start via bot.start from ${ctx.from?.id} (@${ctx.from?.username || 'no_user'})`);
      await this.handleStart(ctx);
    });

    this.bot.command('start', async (ctx) => {
      this.logger.log(`📥 Received /start via bot.command from ${ctx.from?.id}`);
      await this.handleStart(ctx);
    });

    this.bot.command('help', async (ctx) => {
      await this.handleStart(ctx);
    });

    this.bot.on('message', async (ctx, next) => {
      // @ts-ignore
      const text = ctx.message?.text;
      if (text && typeof text === 'string' && text.startsWith('/start')) {
        this.logger.log(`📥 Received /start via bot.on('message') from ${ctx.from?.id}`);
        await this.handleStart(ctx);
        return;
      }
      return next();
    });
  }

  @Start()
  async startCommand(@Ctx() ctx: Context) {
    this.logger.log(`📥 Received /start via @Start() decorator from ${ctx.from?.id}`);
    await this.handleStart(ctx);
  }

  async handleStart(ctx: Context) {
    try {
      const rawWebAppUrl =
        this.configService.get<string>('TELEGRAM_WEBAPP_URL') ||
        this.configService.get<string>('FRONTEND_URL') ||
        'https://web-production-14e41a.up.railway.app';
      const webAppUrl = rawWebAppUrl.trim().replace(/\/+$/, '');

      const botUsername =
        this.configService.get<string>('TELEGRAM_BOT_USERNAME') ||
        this.bot.botInfo?.username ||
        'VibeRoomBot';

      // Deep link payload (e.g. /start room_123)
      // @ts-ignore
      const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      // @ts-ignore
      const payload = ctx.payload || (messageText ? messageText.split(' ')[1] : '');

      this.logger.log(`handleStart: payload="${payload}", webAppUrl="${webAppUrl}", botUsername="${botUsername}"`);

      // WebApp buttons in Telegram STRICTLY REQUIRE https://
      const isHttps = webAppUrl.startsWith('https://');

      if (payload && payload.startsWith('room_')) {
        const inviteMsg =
          `🍿 <b>Вас запросили до VIBEROOM!</b> 🍿\n\n` +
          `🎬 Ваш друг чекає на вас у кімнаті для спільного перегляду!\n` +
          `🎙️ Спілкуйтеся голосом, коментуйте в живому чаті та дивіться відео разом.\n\n` +
          `Тисніть кнопку нижче, щоб зайти прямо зараз! 👇`;

        if (isHttps) {
          const roomInviteUrl = `${webAppUrl}${webAppUrl.includes('?') ? '&' : '?'}startapp=${payload}`;
          await ctx.reply(inviteMsg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              Markup.button.webApp('🎉 Приєднатися до кімнати', roomInviteUrl),
            ]),
          });
        } else {
          const tmeUrl = `https://t.me/${botUsername}?startapp=${payload}`;
          await ctx.reply(inviteMsg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              Markup.button.url('🎉 Приєднатися до кімнати', tmeUrl),
            ]),
          });
        }
        return;
      }

      const welcomeMsg =
        `✨ <b>Ласкаво просимо до VIBEROOM!</b> ✨\n\n` +
        `🎬 <b>Дивіться відео разом:</b> синхронний перегляд YouTube без затримок\n` +
        `🎙️ <b>Голосовий звʼязок:</b> спілкуйтеся з друзями в реальному часі\n` +
        `💬 <b>Живий чат:</b> коментуйте, діліться враженнями та реакціями\n` +
        `👥 <b>Система друзів:</b> кличте друзів у кімнату в один клік\n\n` +
        `Тисніть кнопку нижче, щоб розпочати перегляд! 👇`;

      if (isHttps) {
        await ctx.reply(welcomeMsg, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            Markup.button.webApp('🚀 Відкрити VIBEROOM', webAppUrl),
          ]),
        });
      } else {
        const tmeUrl = `https://t.me/${botUsername}`;
        await ctx.reply(welcomeMsg, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            Markup.button.url('🚀 Відкрити VIBEROOM', tmeUrl),
          ]),
        });
      }
    } catch (err: any) {
      this.logger.error(`Error in handleStart: ${err.message}`, err.stack);
      // Emergency fallback: plain text message without markup or buttons
      try {
        await ctx.reply(
          '✨ Ласкаво просимо до VIBEROOM! ✨\n\n🎬 Синхронний перегляд відео разом з друзями\n🎙️ Голосовий звʼязок та чат\n\nТисніть на кнопку "VIBE" внизу або у шапці чату, щоб відкрити додаток!',
        );
      } catch (fallbackErr: any) {
        this.logger.error(`Emergency fallback failed: ${fallbackErr.message}`);
      }
    }
  }

  async sendRoomInviteNotification(
    senderName: string,
    recipientTelegramId: string,
    roomTitle: string,
    roomId: string,
  ): Promise<boolean> {
    const rawWebAppUrl =
      this.configService.get<string>('TELEGRAM_WEBAPP_URL') ||
      this.configService.get<string>('FRONTEND_URL') ||
      'https://web-production-14e41a.up.railway.app';
    const webAppUrl = rawWebAppUrl.trim().replace(/\/+$/, '');
    const botUsername =
      this.configService.get<string>('TELEGRAM_BOT_USERNAME') ||
      this.bot.botInfo?.username ||
      'VibeRoomBot';
    const isHttps = webAppUrl.startsWith('https://');

    const roomUrl = isHttps
      ? `${webAppUrl}${webAppUrl.includes('?') ? '&' : '?'}startapp=room_${roomId}`
      : `https://t.me/${botUsername}?startapp=room_${roomId}`;

    const text =
      `🔔 <b>Запрошення у VIBEROOM!</b>\n\n` +
      `🍿 Користувач <b>${senderName}</b> кличе вас дивитися відео разом у кімнаті:\n` +
      `🎬 <b>«${roomTitle}»</b>\n\n` +
      `Тисніть кнопку нижче, щоб увійти! 👇`;

    try {
      await this.bot.telegram.sendMessage(recipientTelegramId, text, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            isHttps
              ? [Markup.button.webApp('🍿 Приєднатися до кімнати', roomUrl)]
              : [Markup.button.url('🍿 Приєднатися до кімнати', roomUrl)],
          ],
        },
      });
      return true;
    } catch (err: any) {
      this.logger.warn(
        `Failed to send telegram bot notification to ${recipientTelegramId}: ${err.message}`,
      );
      // Fallback plain text send
      try {
        await this.bot.telegram.sendMessage(
          recipientTelegramId,
          `🔔 Запрошення у VIBEROOM!\n\nКористувач ${senderName} кличе вас дивитися: ${roomTitle}\n\nВхід: ${roomUrl}`,
        );
        return true;
      } catch (e: any) {
        return false;
      }
    }
  }
}
