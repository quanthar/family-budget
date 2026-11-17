import assert from 'node:assert/strict';
import test from 'node:test';
import { Bot } from 'grammy';
import type { AppConfig } from './config.js';
import { createHttpServer } from './server.js';

test('HTTP server serves /health and /api/health with 200 OK', async () => {
  const dummyConfig: AppConfig = {
    botToken: '123:test',
    adminTelegramIds: new Set(['1']),
    port: 0,
    databaseUrl: undefined,
    sqlitePath: ':memory:',
    webhookBaseUrl: undefined,
    webhookSecretPath: '/telegram/webhook/test',
    webhookSecretToken: 'secret',
    defaultInviteCode: 'INV',
  };

  const bot = new Bot(dummyConfig.botToken);
  const server = createHttpServer({
    bot,
    config: dummyConfig,
    storageKind: 'sqlite',
    mode: 'polling',
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    for (const path of ['/health', '/api/health']) {
      const res = await fetch(`${baseUrl}${path}`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        ok: boolean;
        service: string;
        mode: string;
        storage: string;
      };
      assert.equal(body.ok, true);
      assert.equal(body.service, 'secret-santa-bot');
      assert.equal(body.mode, 'polling');
      assert.equal(body.storage, 'sqlite');
    }

    const notFound = await fetch(`${baseUrl}/unknown`);
    assert.equal(notFound.status, 404);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
