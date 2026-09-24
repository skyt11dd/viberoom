import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const update = await req.json();

    // Only process message updates
    const message = update.message;
    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat?.id;
    const text = (message.text || '').trim();

    if (!chatId) {
      return NextResponse.json({ ok: true });
    }

    // Handle /start and /help commands
    if (text.startsWith('/start') || text.startsWith('/help')) {
      const parts = text.split(' ');
      const payload = parts.length > 1 ? parts[1].trim() : '';

      const rawWebAppUrl =
        process.env.TELEGRAM_WEBAPP_URL ||
        process.env.NEXT_PUBLIC_WEBAPP_URL ||
        'https://web-production-14e41a.up.railway.app';
      const webAppUrl = rawWebAppUrl.trim().replace(/\/+$/, '');

      let replyText = '';
      let replyMarkup = {};

      if (payload && payload.startsWith('room_')) {
        const roomInviteUrl = `${webAppUrl}${webAppUrl.includes('?') ? '&' : '?'}startapp=${payload}`;
        replyText =
          `🍿 <b>Вас запросили до VIBEROOM!</b> 🍿\n\n` +
          `🎬 Ваш друг чекає на вас у кімнаті для спільного перегляду!\n` +
          `🎙️ Спілкуйтеся голосом, коментуйте в живому чаті та дивіться відео разом.\n\n` +
          `Тисніть кнопку нижче, щоб зайти прямо зараз! 👇`;

        replyMarkup = {
          inline_keyboard: [
            [
              {
                text: '🎉 Приєднатися до кімнати',
                web_app: { url: roomInviteUrl },
              },
            ],
          ],
        };
      } else {
        replyText =
          `✨ <b>Ласкаво просимо до VIBEROOM!</b> ✨\n\n` +
          `🎬 <b>Дивіться відео разом:</b> синхронний перегляд YouTube без затримок\n` +
          `🎙️ <b>Голосовий звʼязок:</b> спілкуйтеся з друзями в реальному часі\n` +
          `💬 <b>Живий чат:</b> коментуйте, діліться враженнями та реакціями\n` +
          `👥 <b>Система друзів:</b> кличте друзів у кімнату в один клік\n\n` +
          `Тисніть кнопку нижче, щоб розпочати перегляд! 👇`;

        replyMarkup = {
          inline_keyboard: [
            [
              {
                text: '🚀 Відкрити VIBEROOM',
                web_app: { url: webAppUrl },
              },
            ],
          ],
        };
      }

      // Check if we have token to call Telegram API directly
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token && token !== 'your_telegram_bot_token' && token !== 'dummy_token') {
        try {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: replyText,
              parse_mode: 'HTML',
              reply_markup: replyMarkup,
            }),
          });
        } catch (fetchErr) {
          console.error('Failed to send message directly via fetch:', fetchErr);
        }
      }

      // Return Telegram webhook response method as a guaranteed fallback
      // When webhook responds with { method: 'sendMessage', ... }, Telegram executes it automatically!
      return NextResponse.json({
        method: 'sendMessage',
        chat_id: chatId,
        text: replyText,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Telegram webhook handling error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'VIBEROOM Telegram Webhook is active and waiting for updates.',
  });
}
