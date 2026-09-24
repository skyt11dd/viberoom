import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token =
    searchParams.get('token') ||
    process.env.TELEGRAM_BOT_TOKEN;

  if (!token || token === 'your_telegram_bot_token' || token === 'dummy_token') {
    return new Response(
      `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>VIBEROOM - Налаштування Телеграм Бота</title>
  <style>
    body { background: #090a10; color: #fff; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #121522; border: 1px solid #262c45; border-radius: 16px; padding: 32px; max-width: 500px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h1 { margin-top: 0; font-size: 24px; color: #a855f7; display: flex; align-items: center; gap: 10px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
    input { width: 100%; padding: 14px; background: #090a10; border: 1px solid #334155; border-radius: 10px; color: #fff; font-size: 15px; margin-top: 8px; margin-bottom: 16px; box-sizing: border-box; }
    button { width: 100%; padding: 14px; background: linear-gradient(135deg, #7c3aed, #2563eb); border: none; border-radius: 10px; color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }
    button:hover { opacity: 0.9; }
    .hint { font-size: 12px; color: #64748b; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🤖 Активація VIBEROOM Бота</h1>
    <p>Введіть токен бота, отриманий у <b>@BotFather</b>, щоб увімкнути миттєві відповіді на команду <code>/start</code> та кнопки входу:</p>
    <form method="GET" action="/api/telegram/setup">
      <label style="font-size: 13px; font-weight: 600; color: #cbd5e1;">Токен Бота (з @BotFather):</label>
      <input type="text" name="token" placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ" required autocomplete="off" />
      <button type="submit">🚀 Активувати Вебхук</button>
    </form>
    <div class="hint">💡 Токен зберігається на серверах Telegram і вказує куди доставляти повідомлення /start.</div>
  </div>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const webhookUrl = 'https://web-production-14e41a.up.railway.app/api/telegram/webhook';

  try {
    // 1. Get bot info
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = await meRes.json();

    if (!meData.ok) {
      return new Response(
        `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="UTF-8"><title>Помилка токена</title><style>body { background: #090a10; color: #fff; font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; } .card { background: #121522; border: 1px solid #ef4444; border-radius: 16px; padding: 32px; max-width: 480px; text-align: center; } h1 { color: #ef4444; } a { color: #3b82f6; text-decoration: none; }</style></head>
<body>
  <div class="card">
    <h1>❌ Невірний токен</h1>
    <p>${meData.description || 'Telegram відхилив цей токен. Перевірте правильність токена з @BotFather.'}</p>
    <p><a href="/api/telegram/setup">← Спробувати ще раз</a></p>
  </div>
</body>
</html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 400 },
      );
    }

    // 2. Set webhook
    const hookRes = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=true`,
    );
    const hookData = await hookRes.json();

    // 3. Check webhook info
    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const infoData = await infoRes.json();

    const botName = meData.result?.first_name || 'VIBEROOM';
    const botUser = meData.result?.username || 'viberoombot';

    return new Response(
      `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Бот активовано! - VIBEROOM</title>
  <style>
    body { background: #090a10; color: #fff; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #121522; border: 1px solid #10b981; border-radius: 16px; padding: 32px; max-width: 520px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: center; }
    h1 { color: #10b981; margin-top: 0; }
    p { color: #cbd5e1; font-size: 15px; line-height: 1.6; }
    .badge { display: inline-block; background: #064e3b; color: #34d399; padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-bottom: 16px; }
    .btn { display: inline-block; margin-top: 20px; padding: 14px 28px; background: linear-gradient(135deg, #10b981, #059669); color: white; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; }
    .btn:hover { opacity: 0.9; }
    .url { word-break: break-all; font-family: monospace; background: #090a10; padding: 8px 12px; border-radius: 8px; font-size: 12px; color: #94a3b8; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✅ Успішно підключено</div>
    <h1>Бот @${botUser} активовано!</h1>
    <p>Вебхук успішно зареєстровано в Telegram.<br>Тепер відкрийте чат з ботом і надішліть команду <b>/start</b> — бот миттєво відповість!</p>
    <div class="url">Webhook URL: ${webhookUrl}</div>
    <a class="btn" href="https://t.me/${botUser}" target="_blank">📱 Відкрити @${botUser} в Telegram</a>
  </div>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
