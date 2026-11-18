import { configureBotCommands, createBot } from './bot/index.js';
import { loadConfig } from './config.js';
import { createStore } from './db/store.js';
import { createHttpServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const store = createStore(config.databaseUrl, config.sqlitePath);
  await store.init(config.defaultInviteCode);
  console.log(`[DB] Initialized (${store.kind})`);

  const bot = createBot(store, config);
  await bot.init();
  console.log(`[BOT] Authorized as @${bot.botInfo.username}`);

  const game = await store.getGame(1);
  if (
    game &&
    config.adminTelegramIds.size === 0 &&
    !game.adminTelegramId &&
    game.adminClaimCode
  ) {
    console.log(
      `[ADMIN] Claim organizer access via: https://t.me/${bot.botInfo.username}?start=${game.adminClaimCode}`,
    );
  }

  try {
    await configureBotCommands(bot);
  } catch (err) {
    console.warn('[BOT] Failed to set bot commands:', err);
  }

  const mode: 'webhook' | 'polling' = config.webhookBaseUrl
    ? 'webhook'
    : 'polling';

  const server = createHttpServer({
    bot,
    config,
    storageKind: store.kind,
    mode,
  });

  await new Promise<void>((resolve) => {
    server.listen(config.port, '0.0.0.0', () => {
      console.log(`[HTTP] Listening on 0.0.0.0:${config.port} (mode=${mode})`);
      resolve();
    });
  });

  if (mode === 'webhook' && config.webhookBaseUrl) {
    const fullWebhookUrl = `${config.webhookBaseUrl}${config.webhookSecretPath}`;
    await bot.api.setWebhook(fullWebhookUrl, {
      secret_token: config.webhookSecretToken,
      drop_pending_updates: false,
    });
    console.log(`[BOT] Webhook configured: ${config.webhookBaseUrl}/telegram/webhook/***`);
  } else {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    console.log('[BOT] Starting long polling...');
    void bot.start({
      onStart: () => console.log('[BOT] Polling active'),
    });
  }

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[SYS] Received ${signal}, shutting down...`);

    if (mode === 'polling') {
      await bot.stop();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
