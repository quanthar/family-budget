import crypto from 'node:crypto';
import 'dotenv/config';

export interface AppConfig {
  botToken: string;
  adminTelegramIds: Set<string>;
  port: number;
  databaseUrl: string | undefined;
  sqlitePath: string;
  webhookBaseUrl: string | undefined;
  webhookSecretPath: string;
  webhookSecretToken: string;
  defaultInviteCode: string;
}

function normalizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : undefined;
}

export function loadConfig(): AppConfig {
  const botToken = process.env.BOT_TOKEN?.trim() ?? '';
  if (!botToken) {
    throw new Error('BOT_TOKEN environment variable is required');
  }

  const rawAdmins =
    process.env.ADMIN_TELEGRAM_IDS?.trim() ||
    process.env.ADMIN_TELEGRAM_ID?.trim() ||
    '';

  const adminTelegramIds = new Set(
    rawAdmins
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );

  const port = Number(process.env.PORT || 3000);
  const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;
  const sqlitePath = process.env.SQLITE_PATH?.trim() || './data/santa.db';

  const webhookBaseUrl = normalizeUrl(
    process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL,
  );

  // Derive deterministic webhook secret path & header token from BOT_TOKEN
  const digest = crypto.createHash('sha256').update(botToken).digest('hex');
  const webhookSecretPath = `/telegram/webhook/${digest.slice(0, 24)}`;
  const webhookSecretToken = digest.slice(24, 56);

  const defaultInviteCode =
    process.env.INVITE_CODE?.trim() ||
    crypto.randomBytes(6).toString('base64url');

  return {
    botToken,
    adminTelegramIds,
    port: Number.isFinite(port) && port > 0 ? port : 3000,
    databaseUrl,
    sqlitePath,
    webhookBaseUrl,
    webhookSecretPath,
    webhookSecretToken,
    defaultInviteCode,
  };
}

export function isPostgresUrl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false;
  return (
    databaseUrl.startsWith('postgres://') ||
    databaseUrl.startsWith('postgresql://')
  );
}
