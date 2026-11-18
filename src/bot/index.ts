import { Bot } from 'grammy';
import type { AppConfig } from '../config.js';
import type { SantaStore } from '../db/store.js';
import { registerHandlers } from './handlers.js';

export function createBot(store: SantaStore, config: AppConfig): Bot {
  const bot = new Bot(config.botToken);

  bot.catch((err) => {
    console.error('Bot error while handling update:', err.error);
  });

  registerHandlers({ bot, store, config });
  return bot;
}

export async function configureBotCommands(bot: Bot): Promise<void> {
  await bot.api.setMyCommands([
    { command: 'menu', description: 'Открыть главное меню' },
    { command: 'games', description: 'Мои игры и создание новой' },
    { command: 'admin', description: 'Админ-панель (для организатора)' },
    { command: 'cancel', description: 'Отменить текущий ввод' },
  ]);
}
