import http from 'node:http';
import { webhookCallback } from 'grammy';
import type { Bot } from 'grammy';
import type { AppConfig } from './config.js';

export interface ServerOptions {
  bot: Bot;
  config: AppConfig;
  storageKind: 'sqlite' | 'postgres';
  mode: 'webhook' | 'polling';
}

export function createHttpServer({
  bot,
  config,
  storageKind,
  mode,
}: ServerOptions): http.Server {
  const handleWebhook =
    mode === 'webhook'
      ? webhookCallback(bot, 'http', {
          secretToken: config.webhookSecretToken,
        })
      : null;

  return http.createServer(async (req, res) => {
    const urlPath = (req.url || '/').split('?')[0];

    if (
      req.method === 'GET' &&
      (urlPath === '/' || urlPath === '/health' || urlPath === '/api/health')
    ) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          service: 'secret-santa-bot',
          mode,
          storage: storageKind,
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    if (
      handleWebhook &&
      req.method === 'POST' &&
      urlPath === config.webhookSecretPath
    ) {
      try {
        await handleWebhook(req, res);
      } catch (err) {
        console.error('Webhook handler error:', err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  });
}
