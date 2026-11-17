import crypto from 'node:crypto';
import type { Bot, Context } from 'grammy';
import { GrammyError, InlineKeyboard } from 'grammy';
import type { AppConfig } from '../config.js';
import type { SantaStore } from '../db/store.js';
import { DrawError, generateDraw } from '../domain/draw.js';
import type { GameSettings, Participant } from '../types.js';
import {
  escapeHtml,
  formatAdminDashboard,
  formatGameHeader,
  formatHomeMessage,
  formatMyProfileBlock,
  formatParticipantLabel,
  groupExclusions,
} from './formatters.js';
import {
  buildAdminDeleteParticipantConfirmKeyboard,
  buildAdminExclusionsKeyboard,
  buildAdminInviteKeyboard,
  buildAdminKeyboard,
  buildAdminParticipantsKeyboard,
  buildAdminSettingsKeyboard,
  buildCancelKeyboard,
  buildConfirmDrawKeyboard,
  buildConfirmResetKeyboard,
  buildHomeKeyboard,
  buildPickExclusionDirectionKeyboard,
  buildPickGiverKeyboard,
  buildPickReceiverKeyboard,
  buildProfileViewKeyboard,
} from './keyboards.js';

interface Deps {
  bot: Bot;
  store: SantaStore;
  config: AppConfig;
}

function getTelegramId(ctx: Context): string | null {
  return ctx.from ? String(ctx.from.id) : null;
}

function defaultDisplayName(ctx: Context): string {
  const first = ctx.from?.first_name?.trim() || '';
  const last = ctx.from?.last_name?.trim() || '';
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (ctx.from?.username) return `@${ctx.from.username}`;
  return `Участник ${ctx.from?.id ?? ''}`.trim();
}

function isAdminUser(
  config: AppConfig,
  game: GameSettings,
  telegramId: string,
): boolean {
  return (
    config.adminTelegramIds.has(telegramId) ||
    game.adminTelegramId === telegramId
  );
}

async function safeEditOrSend(
  ctx: Context,
  text: string,
  replyMarkup: InlineKeyboard,
): Promise<void> {
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
        link_preview_options: { is_disabled: true },
      });
      return;
    } catch (err) {
      if (
        err instanceof GrammyError &&
        err.description.includes('message is not modified')
      ) {
        return;
      }
      // Fall through to reply if editing is impossible
    }
  }

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
    link_preview_options: { is_disabled: true },
  });
}

async function safeAnswerCallback(
  ctx: Context,
  text?: string,
  showAlert = false,
): Promise<void> {
  if (!ctx.callbackQuery) return;
  try {
    await ctx.answerCallbackQuery({ text, show_alert: showAlert });
  } catch {
    // Ignore expired callback query errors
  }
}

export function registerHandlers({ bot, store, config }: Deps): void {
  async function renderHome(ctx: Context, telegramId: string): Promise<void> {
    await store.setSession(telegramId, { type: 'idle' });
    const [game, me] = await Promise.all([
      store.getGame(),
      store.getParticipantByTelegramId(telegramId),
    ]);
    const isAdmin = isAdminUser(config, game, telegramId);

    if (!me) {
      if (isAdmin) {
        await renderAdminHome(ctx, telegramId);
        return;
      }
      await ctx.reply(
        '🔒 Это закрытый бот «Тайный Санта» для своей компании.\nЧтобы попасть в игру, перейди по пригласительной ссылке от организатора.',
      );
      return;
    }

    const participants = await store.listParticipants();
    const wishlistCount = participants.filter((p) => Boolean(p.wishlist)).length;
    const recipient =
      game.status === 'drawn' && me.recipientId
        ? await store.getParticipantById(me.recipientId)
        : null;

    const text = formatHomeMessage(
      game,
      me,
      recipient,
      participants.length,
      wishlistCount,
    );
    const kb = buildHomeKeyboard(game.status, isAdmin, me.giftReady);
    await safeEditOrSend(ctx, text, kb);
  }

  async function renderAdminHome(
    ctx: Context,
    telegramId: string,
  ): Promise<void> {
    await store.setSession(telegramId, { type: 'idle' });
    const [game, participants, exclusions, me] = await Promise.all([
      store.getGame(),
      store.listParticipants(),
      store.listExclusions(),
      store.getParticipantByTelegramId(telegramId),
    ]);

    const grouped = groupExclusions(exclusions, participants);
    const text = formatAdminDashboard(game, participants, grouped.length);
    const kb = buildAdminKeyboard(game.status, Boolean(me));
    await safeEditOrSend(ctx, text, kb);
  }

  async function requireParticipantOrAdmin(
    ctx: Context,
  ): Promise<{ telegramId: string; isAdmin: boolean; me: Participant | null } | null> {
    if (ctx.chat?.type !== 'private') {
      if (ctx.message?.text?.startsWith('/')) {
        await ctx.reply(
          '🎅 Напиши мне в личные сообщения, чтобы участвовать в Тайном Санте!',
        );
      }
      return null;
    }

    const telegramId = getTelegramId(ctx);
    if (!telegramId) return null;

    const [game, me] = await Promise.all([
      store.getGame(),
      store.getParticipantByTelegramId(telegramId),
    ]);
    const isAdmin = isAdminUser(config, game, telegramId);

    if (!me && !isAdmin) {
      await safeAnswerCallback(
        ctx,
        'Доступ только по инвайт-ссылке от организатора.',
        true,
      );
      if (!ctx.callbackQuery) {
        await ctx.reply(
          '🔒 Это закрытый бот «Тайный Санта» для своей компании.\nЧтобы попасть в игру, перейди по пригласительной ссылке от организатора.',
        );
      }
      return null;
    }

    return { telegramId, isAdmin, me };
  }

  // --- Commands ---

  bot.command('start', async (ctx) => {
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(
        '🎅 Напиши мне в личные сообщения, чтобы участвовать в Тайном Санте!',
      );
      return;
    }

    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;

    const payload = ctx.match?.trim() || '';
    let game = await store.getGame();

    // One-time admin claim if ADMIN_TELEGRAM_ID env var is not configured
    if (
      config.adminTelegramIds.size === 0 &&
      !game.adminTelegramId &&
      game.adminClaimCode &&
      payload === game.adminClaimCode
    ) {
      game = await store.claimAdmin(telegramId);
      await ctx.reply(
        `👑 Права организатора привязаны к твоему аккаунту!\nТвой Telegram ID: <code>${escapeHtml(telegramId)}</code>`,
        { parse_mode: 'HTML' },
      );
      await renderAdminHome(ctx, telegramId);
      return;
    }

    const isAdmin = isAdminUser(config, game, telegramId);
    const existing = await store.getParticipantByTelegramId(telegramId);

    if (existing) {
      await store.updateParticipantProfile(telegramId, {
        username: ctx.from?.username ?? null,
      });
      await renderHome(ctx, telegramId);
      return;
    }

    if (payload && payload === game.inviteCode) {
      if (game.status === 'drawn') {
        if (isAdmin) {
          await renderAdminHome(ctx, telegramId);
        } else {
          await ctx.reply(
            '🎄 Жеребьёвка уже проведена, регистрация новых участников закрыта.\nЕсли это ошибка — напиши организатору.',
          );
        }
        return;
      }

      const { participant } = await store.upsertParticipant({
        telegramId,
        username: ctx.from?.username ?? null,
        displayName: defaultDisplayName(ctx),
      });

      await ctx.reply(
        `🎉 Добро пожаловать в «${escapeHtml(game.title)}», <b>${escapeHtml(participant.displayName)}</b>!\nЗаполни свой вишлист в меню ниже.`,
        { parse_mode: 'HTML' },
      );
      await renderHome(ctx, telegramId);
      return;
    }

    if (isAdmin) {
      await renderAdminHome(ctx, telegramId);
      return;
    }

    await ctx.reply(
      '🔒 Это закрытый бот «Тайный Санта» для своей компании.\nПопроси у организатора актуальную ссылку-приглашение.',
    );
  });

  bot.command(['menu', 'santa'], async (ctx) => {
    const auth = await requireParticipantOrAdmin(ctx);
    if (!auth) return;
    await renderHome(ctx, auth.telegramId);
  });

  bot.command('admin', async (ctx) => {
    const auth = await requireParticipantOrAdmin(ctx);
    if (!auth) return;
    if (!auth.isAdmin) {
      await ctx.reply('⛔ Эта команда доступна только организатору.');
      return;
    }
    await renderAdminHome(ctx, auth.telegramId);
  });

  bot.command('cancel', async (ctx) => {
    const auth = await requireParticipantOrAdmin(ctx);
    if (!auth) return;
    await store.setSession(auth.telegramId, { type: 'idle' });
    await ctx.reply('Действие отменено.');
    await renderHome(ctx, auth.telegramId);
  });

  // --- Navigation Callbacks ---

  bot.callbackQuery('menu:home', async (ctx) => {
    const auth = await requireParticipantOrAdmin(ctx);
    if (!auth) return;
    await safeAnswerCallback(ctx);
    await renderHome(ctx, auth.telegramId);
  });

  bot.callbackQuery('game:participants', async (ctx) => {
    const auth = await requireParticipantOrAdmin(ctx);
    if (!auth) return;
    await safeAnswerCallback(ctx);

    const participants = await store.listParticipants();
    const lines = participants.map((p, idx) => {
      const wishMark = p.wishlist ? '📝' : '⏳';
      return `${idx + 1}. ${formatParticipantLabel(p)} ${wishMark}`;
    });

    const text = [
      `👥 <b>Участники (${participants.length}):</b>`,
      '',
      ...(lines.length > 0 ? lines : ['<i>Пока никого нет</i>']),
      '',
      '📝 — вишлист заполнен, ⏳ — пока пусто',
    ].join('\n');

    await safeEditOrSend(
      ctx,
      text,
      new InlineKeyboard().text('⬅️ В главное меню', 'menu:home'),
    );
  });

  // --- Profile Editing ---

  bot.callbackQuery('profile:view', async (ctx) => {
    const auth = await requireParticipantOrAdmin(ctx);
    if (!auth || !auth.me) return;
    await safeAnswerCallback(ctx);
    await store.setSession(auth.telegramId, { type: 'idle' });
    await safeEditOrSend(
      ctx,
      formatMyProfileBlock(auth.me),
      buildProfileViewKeyboard(),
    );
  });

  bot.callbackQuery('profile:name', async (ctx) => {
    const auth = await requireParticipantOrAdmin(ctx);
    if (!auth || !auth.me) return;
    await safeAnswerCallback(ctx);
    await store.setSession(auth.telegramId, { type: 'edit_name' });
    await safeEditOrSend(
      ctx,
      `✏️ Сейчас твоё имя: <b>${escapeHtml(auth.me.displayName)}</b>\n\nОтправь новое имя (как тебя знают друзья):`,
      buildCancelKeyboard('menu:home'),
    );
  });

  bot.callbackQuery('profile:wishlist', async (ctx) => {
    const auth = await requireParticipantOrAdmin(ctx);
    if (!auth || !auth.me) return;
    await safeAnswerCallback(ctx);
    await store.setSession(auth.telegramId, { type: 'edit_wishlist' });
    const current = auth.me.wishlist
      ? `\n\nСейчас указано:\n<i>${escapeHtml(auth.me.wishlist)}</i>`
      : '';
    await safeEditOrSend(
      ctx,
      `🎁 Напиши свой вишлист — что тебе хотелось бы получить, идеи или ссылки:${current}`,
      buildCancelKeyboard('menu:home'),
    );
  });

  bot.callbackQuery('profile:anti', async (ctx) => {
    const auth = await requireParticipantOrAdmin(ctx);
    if (!auth || !auth.me) return;
    await safeAnswerCallback(ctx);
    await store.setSession(auth.telegramId, { type: 'edit_antiwishlist' });
    const current = auth.me.antiWishlist
      ? `\n\nСейчас указано:\n<i>${escapeHtml(auth.me.antiWishlist)}</i>`
      : '';
    await safeEditOrSend(
      ctx,
      `🚫 Напиши, что точно НЕ стоит дарить (аллергии, нелюбимое), и можешь указать удобный ПВЗ / способ доставки:${current}`,
      buildCancelKeyboard('menu:home'),
    );
  });

  // --- Gift Ready Toggle ---

  bot.callbackQuery('gift:toggle', async (ctx) => {
    const auth = await requireParticipantOrAdmin(ctx);
    if (!auth || !auth.me) return;

    const game = await store.getGame();
    if (game.status !== 'drawn' || !auth.me.recipientId) {
      await safeAnswerCallback(ctx, 'Жеребьёвка ещё не проведена.', true);
      return;
    }

    const nextReady = !auth.me.giftReady;
    await store.setGiftReady(auth.telegramId, nextReady);
    await safeAnswerCallback(
      ctx,
      nextReady ? 'Отмечено: подарок готов! 🎁' : 'Отметка снята.',
    );

    if (nextReady) {
      const recipient = await store.getParticipantById(auth.me.recipientId);
      if (recipient) {
        try {
          await bot.api.sendMessage(
            recipient.telegramId,
            '🎁 <b>Отличные новости!</b> Твой Тайный Санта отметил, что подарок уже готов или отправлен!',
            { parse_mode: 'HTML' },
          );
        } catch {
          // Ignore if recipient blocked bot
        }
      }
    }

    await renderHome(ctx, auth.telegramId);
  });

  // --- Anonymous Chat ---

  bot.callbackQuery('chat:to_recipient', async (ctx) => {
    const auth = await requireParticipantOrAdmin(ctx);
    if (!auth || !auth.me) return;
    const game = await store.getGame();
    if (game.status !== 'drawn' || !auth.me.recipientId) {
      await safeAnswerCallback(ctx, 'Сначала должна пройти жеребьёвка.', true);
      return;
    }
    const recipient = await store.getParticipantById(auth.me.recipientId);
    if (!recipient) {
      await safeAnswerCallback(ctx, 'Подопечный не найден.', true);
      return;
    }

    await safeAnswerCallback(ctx);
    await store.setSession(auth.telegramId, { type: 'msg_to_recipient' });
    await ctx.reply(
      `✉️ Напиши анонимное сообщение для <b>${escapeHtml(recipient.displayName)}</b>.\nТвоё имя не будет раскрыто.`,
      {
        parse_mode: 'HTML',
        reply_markup: buildCancelKeyboard('menu:home'),
      },
    );
  });

  bot.callbackQuery('chat:to_santa', async (ctx) => {
    const auth = await requireParticipantOrAdmin(ctx);
    if (!auth || !auth.me) return;
    const game = await store.getGame();
    if (game.status !== 'drawn') {
      await safeAnswerCallback(ctx, 'Сначала должна пройти жеребьёвка.', true);
      return;
    }
    const santa = await store.getSantaForRecipient(auth.me.id);
    if (!santa) {
      await safeAnswerCallback(ctx, 'Твой Санта ещё не назначен.', true);
      return;
    }

    await safeAnswerCallback(ctx);
    await store.setSession(auth.telegramId, { type: 'msg_to_santa' });
    await ctx.reply(
      '🎅 Напиши сообщение своему Тайному Санте — я перешлю его без раскрытия (Санта увидит только, что это от его подопечного):',
      {
        reply_markup: buildCancelKeyboard('menu:home'),
      },
    );
  });

  // --- Admin Panel ---

  async function requireAdminCallback(
    ctx: Context,
  ): Promise<{ telegramId: string } | null> {
    const auth = await requireParticipantOrAdmin(ctx);
    if (!auth) return null;
    if (!auth.isAdmin) {
      await safeAnswerCallback(ctx, 'Доступно только организатору.', true);
      return null;
    }
    return { telegramId: auth.telegramId };
  }

  bot.callbackQuery('admin:home', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    await safeAnswerCallback(ctx);
    await renderAdminHome(ctx, admin.telegramId);
  });

  bot.callbackQuery('admin:join_self', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    const game = await store.getGame();
    if (game.status === 'drawn') {
      await safeAnswerCallback(
        ctx,
        'Жеребьёвка уже проведена — сначала сбрось пары, чтобы добавить себя.',
        true,
      );
      return;
    }
    await store.upsertParticipant({
      telegramId: admin.telegramId,
      username: ctx.from?.username ?? null,
      displayName: defaultDisplayName(ctx),
    });
    await safeAnswerCallback(ctx, 'Ты добавлен в список участников! 🎄');
    await renderHome(ctx, admin.telegramId);
  });

  bot.callbackQuery('admin:invite', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    await safeAnswerCallback(ctx);

    const game = await store.getGame();
    const botUsername = bot.botInfo?.username;
    const link = botUsername
      ? `https://t.me/${botUsername}?start=${game.inviteCode}`
      : `Код приглашения: ${game.inviteCode}`;

    const text = [
      '🔗 <b>Приглашение для друзей</b>',
      '',
      `Отправь эту ссылку в ваш чат:`,
      `<code>${escapeHtml(link)}</code>`,
      '',
      'Попасть в игру смогут только те, кто перейдёт по этой ссылке.',
    ].join('\n');

    await safeEditOrSend(ctx, text, buildAdminInviteKeyboard());
  });

  bot.callbackQuery('admin:invite:regen', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;

    const newCode = crypto.randomBytes(6).toString('base64url');
    const game = await store.updateGameSettings({ inviteCode: newCode });
    await safeAnswerCallback(ctx, 'Инвайт-код обновлён!');

    const botUsername = bot.botInfo?.username;
    const link = botUsername
      ? `https://t.me/${botUsername}?start=${game.inviteCode}`
      : `Код приглашения: ${game.inviteCode}`;

    const text = [
      '🔗 <b>Новая ссылка для друзей</b>',
      '',
      `<code>${escapeHtml(link)}</code>`,
      '',
      'Старая ссылка больше не действует (уже вошедшие участники остаются в игре).',
    ].join('\n');

    await safeEditOrSend(ctx, text, buildAdminInviteKeyboard());
  });

  // --- Admin Settings ---

  bot.callbackQuery('admin:settings', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    await safeAnswerCallback(ctx);
    const game = await store.getGame();
    await safeEditOrSend(
      ctx,
      `📝 <b>Настройки игры</b>\n\n${formatGameHeader(game)}`,
      buildAdminSettingsKeyboard(),
    );
  });

  bot.callbackQuery('admin:set_title', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    await safeAnswerCallback(ctx);
    await store.setSession(admin.telegramId, { type: 'admin_edit_title' });
    await safeEditOrSend(
      ctx,
      '✏️ Отправь новое название игры (например: <code>Тайный Санта 2027 🎄</code>):',
      buildCancelKeyboard('admin:settings'),
    );
  });

  bot.callbackQuery('admin:set_budget', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    await safeAnswerCallback(ctx);
    await store.setSession(admin.telegramId, { type: 'admin_edit_budget' });
    await safeEditOrSend(
      ctx,
      '💰 Отправь рекомендуемый бюджет подарка (например: <code>до 2000 ₽</code>):',
      buildCancelKeyboard('admin:settings'),
    );
  });

  bot.callbackQuery('admin:clear_budget', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    const game = await store.updateGameSettings({ budget: null });
    await safeAnswerCallback(ctx, 'Бюджет убран.');
    await safeEditOrSend(
      ctx,
      `📝 <b>Настройки игры</b>\n\n${formatGameHeader(game)}`,
      buildAdminSettingsKeyboard(),
    );
  });

  bot.callbackQuery('admin:set_date', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    await safeAnswerCallback(ctx);
    await store.setSession(admin.telegramId, { type: 'admin_edit_date' });
    await safeEditOrSend(
      ctx,
      '📅 Отправь дату или место обмена подарками (например: <code>28 декабря, бар/дача</code>):',
      buildCancelKeyboard('admin:settings'),
    );
  });

  bot.callbackQuery('admin:clear_date', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    const game = await store.updateGameSettings({ eventDate: null });
    await safeAnswerCallback(ctx, 'Дата убрана.');
    await safeEditOrSend(
      ctx,
      `📝 <b>Настройки игры</b>\n\n${formatGameHeader(game)}`,
      buildAdminSettingsKeyboard(),
    );
  });

  // --- Admin Participants Removal ---

  bot.callbackQuery('admin:participants', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    await safeAnswerCallback(ctx);

    const participants = await store.listParticipants();
    const lines = participants.map(
      (p, i) => `${i + 1}. ${formatParticipantLabel(p)} ${p.wishlist ? '📝' : '⏳'}`,
    );

    const text = [
      `👥 <b>Управление участниками (${participants.length})</b>`,
      '',
      ...(lines.length > 0 ? lines : ['<i>Пока никого нет</i>']),
      '',
      'Нажми на участника ниже, чтобы удалить его из игры:',
    ].join('\n');

    await safeEditOrSend(
      ctx,
      text,
      buildAdminParticipantsKeyboard(participants),
    );
  });

  bot.callbackQuery(/^admin:del_user_ask:(\d+)$/, async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    const id = Number(ctx.match[1]);
    const target = await store.getParticipantById(id);
    if (!target) {
      await safeAnswerCallback(ctx, 'Участник уже удалён.', true);
      return;
    }

    const game = await store.getGame();
    await safeAnswerCallback(ctx);

    const warning =
      game.status === 'drawn'
        ? '\n\n⚠️ <b>Жеребьёвка уже проведена!</b> Удаление участника разорвёт пару — после этого лучше сбросить жеребьёвку и провести её заново.'
        : '';

    await safeEditOrSend(
      ctx,
      `Удалить участника <b>${formatParticipantLabel(target)}</b>?${warning}`,
      buildAdminDeleteParticipantConfirmKeyboard(id),
    );
  });

  bot.callbackQuery(/^admin:del_user_do:(\d+)$/, async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    const id = Number(ctx.match[1]);
    await store.removeParticipant(id);
    await safeAnswerCallback(ctx, 'Участник удалён.');

    const participants = await store.listParticipants();
    const lines = participants.map(
      (p, i) => `${i + 1}. ${formatParticipantLabel(p)} ${p.wishlist ? '📝' : '⏳'}`,
    );
    await safeEditOrSend(
      ctx,
      [
        `👥 <b>Управление участниками (${participants.length})</b>`,
        '',
        ...(lines.length > 0 ? lines : ['<i>Пока никого нет</i>']),
      ].join('\n'),
      buildAdminParticipantsKeyboard(participants),
    );
  });

  // --- Admin Exclusions (Forbidden Pairs) ---

  async function renderAdminExclusions(ctx: Context): Promise<void> {
    const [participants, exclusions] = await Promise.all([
      store.listParticipants(),
      store.listExclusions(),
    ]);
    const grouped = groupExclusions(exclusions, participants);

    const lines = grouped.map((g, idx) => {
      const arrow = g.mutual ? '↔' : '→';
      const desc = g.mutual
        ? 'не дарят друг другу'
        : 'не дарит';
      return `${idx + 1}. <b>${escapeHtml(g.giver.displayName)}</b> ${arrow} <b>${escapeHtml(g.receiver.displayName)}</b> (${desc})`;
    });

    const text = [
      '🚫 <b>Пары-исключения</b>',
      'Эти пары не выпадут друг другу при жеребьёвке.',
      '',
      ...(lines.length > 0
        ? lines
        : ['<i>Исключений пока нет — все могут выпасть всем.</i>']),
      '',
      grouped.length > 0 ? 'Нажми на пару ниже, чтобы удалить её:' : '',
    ]
      .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
      .join('\n');

    await safeEditOrSend(ctx, text, buildAdminExclusionsKeyboard(grouped));
  }

  bot.callbackQuery('admin:exclusions', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    await safeAnswerCallback(ctx);
    await renderAdminExclusions(ctx);
  });

  bot.callbackQuery('admin:ex_add', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    const participants = await store.listParticipants();
    if (participants.length < 2) {
      await safeAnswerCallback(
        ctx,
        'Нужно минимум 2 участника в игре.',
        true,
      );
      return;
    }
    await safeAnswerCallback(ctx);
    await safeEditOrSend(
      ctx,
      '🚫 <b>Новое исключение (шаг 1/3)</b>\nВыбери первого участника:',
      buildPickGiverKeyboard(participants),
    );
  });

  bot.callbackQuery(/^admin:ex_giver:(\d+)$/, async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    const giverId = Number(ctx.match[1]);
    const participants = await store.listParticipants();
    const giver = participants.find((p) => p.id === giverId);
    if (!giver) {
      await safeAnswerCallback(ctx, 'Участник не найден.', true);
      return;
    }
    await safeAnswerCallback(ctx);
    await safeEditOrSend(
      ctx,
      `🚫 <b>Новое исключение (шаг 2/3)</b>\nПервый: <b>${escapeHtml(giver.displayName)}</b>\n\nВыбери второго участника:`,
      buildPickReceiverKeyboard(giverId, participants),
    );
  });

  bot.callbackQuery(/^admin:ex_recv:(\d+):(\d+)$/, async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    const giverId = Number(ctx.match[1]);
    const receiverId = Number(ctx.match[2]);
    const [giver, receiver] = await Promise.all([
      store.getParticipantById(giverId),
      store.getParticipantById(receiverId),
    ]);
    if (!giver || !receiver) {
      await safeAnswerCallback(ctx, 'Участник не найден.', true);
      return;
    }
    await safeAnswerCallback(ctx);
    await safeEditOrSend(
      ctx,
      `🚫 <b>Новое исключение (шаг 3/3)</b>\nПара: <b>${escapeHtml(giver.displayName)}</b> и <b>${escapeHtml(receiver.displayName)}</b>\n\nСделать запрет взаимным или только в одну сторону?`,
      buildPickExclusionDirectionKeyboard(
        giverId,
        receiverId,
        giver.displayName,
        receiver.displayName,
      ),
    );
  });

  bot.callbackQuery(/^admin:ex_save:(\d+):(\d+):(0|1)$/, async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    const giverId = Number(ctx.match[1]);
    const receiverId = Number(ctx.match[2]);
    const mutual = ctx.match[3] === '1';

    await store.addExclusion(giverId, receiverId, mutual);
    await safeAnswerCallback(ctx, 'Пара-исключение добавлена!');
    await renderAdminExclusions(ctx);
  });

  bot.callbackQuery(/^admin:ex_del:([\d_]+)$/, async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    const ids = ctx.match[1]
      .split('_')
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);

    for (const id of ids) {
      await store.removeExclusion(id);
    }
    await safeAnswerCallback(ctx, 'Исключение удалено!');
    await renderAdminExclusions(ctx);
  });

  // --- Admin Draw & Reset ---

  bot.callbackQuery('admin:draw_confirm', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;

    const [game, participants, exclusions] = await Promise.all([
      store.getGame(),
      store.listParticipants(),
      store.listExclusions(),
    ]);

    if (game.status === 'drawn') {
      await safeAnswerCallback(ctx, 'Жеребьёвка уже проведена!', true);
      return;
    }

    if (participants.length < 2) {
      await safeAnswerCallback(
        ctx,
        'Нужно минимум 2 участника для жеребьёвки!',
        true,
      );
      return;
    }

    await safeAnswerCallback(ctx);
    const noWishlist = participants.filter((p) => !p.wishlist);
    const grouped = groupExclusions(exclusions, participants);

    const warnings: string[] = [];
    if (participants.length === 2) {
      warnings.push(
        '⚠️ Участников всего двое — каждый сразу поймёт, кто его Санта.',
      );
    }
    if (noWishlist.length > 0) {
      warnings.push(
        `⏳ Ещё не заполнили вишлист (${noWishlist.length}): ${noWishlist.map((p) => escapeHtml(p.displayName)).join(', ')}`,
      );
    }

    const text = [
      '🎲 <b>Запуск жеребьёвки</b>',
      '',
      `Участников: <b>${participants.length}</b>`,
      `Пар-исключений: <b>${grouped.length}</b>`,
      ...(warnings.length > 0 ? ['', ...warnings] : []),
      '',
      'После запуска каждый участник получит личное сообщение с именем своего подопечного. Ты как организатор пары не увидишь.',
    ].join('\n');

    await safeEditOrSend(ctx, text, buildConfirmDrawKeyboard());
  });

  bot.callbackQuery('admin:draw_run', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;

    const [game, participants, exclusions] = await Promise.all([
      store.getGame(),
      store.listParticipants(),
      store.listExclusions(),
    ]);

    if (game.status === 'drawn') {
      await safeAnswerCallback(ctx, 'Жеребьёвка уже была проведена!', true);
      await renderAdminHome(ctx, admin.telegramId);
      return;
    }

    let assignments;
    try {
      assignments = generateDraw(
        participants.map((p) => p.id),
        exclusions,
      );
    } catch (err) {
      const msg =
        err instanceof DrawError
          ? err.message
          : 'Ошибка при генерации жеребьёвки.';
      await safeAnswerCallback(ctx, msg, true);
      return;
    }

    const updatedGame = await store.applyDraw(assignments);
    await safeAnswerCallback(ctx, 'Жеребьёвка проведена! 🎲');

    const byId = new Map(participants.map((p) => [p.id, p]));
    let delivered = 0;
    const failedNames: string[] = [];

    for (const a of assignments) {
      const giver = byId.get(a.giverId);
      const receiver = byId.get(a.receiverId);
      if (!giver || !receiver) continue;

      const updatedGiver: Participant = {
        ...giver,
        recipientId: receiver.id,
        giftReady: false,
      };
      const isGiverAdmin = isAdminUser(config, updatedGame, giver.telegramId);

      const messageText = [
        '🎉 <b>Жеребьёвка «Тайный Санта» прошла!</b>',
        '',
        formatHomeMessage(
          updatedGame,
          updatedGiver,
          receiver,
          participants.length,
          participants.filter((p) => Boolean(p.wishlist)).length,
        ),
      ].join('\n');

      try {
        await bot.api.sendMessage(giver.telegramId, messageText, {
          parse_mode: 'HTML',
          reply_markup: buildHomeKeyboard('drawn', isGiverAdmin, false),
          link_preview_options: { is_disabled: true },
        });
        delivered++;
      } catch {
        failedNames.push(giver.displayName);
      }
    }

    const reportLines = [
      `✅ <b>Жеребьёвка успешно проведена!</b>`,
      `Уведомления доставлены: <b>${delivered}/${assignments.length}</b>.`,
    ];
    if (failedNames.length > 0) {
      reportLines.push(
        `⚠️ Не удалось отправить сообщение: ${failedNames.map(escapeHtml).join(', ')} (возможно, бот остановлен у них в ЛС; пусть откроют /menu).`,
      );
    }

    await ctx.reply(reportLines.join('\n'), { parse_mode: 'HTML' });
    await renderAdminHome(ctx, admin.telegramId);
  });

  bot.callbackQuery('admin:reset_confirm', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;
    await safeAnswerCallback(ctx);
    await safeEditOrSend(
      ctx,
      '⚠️ <b>Сброс жеребьёвки</b>\n\nВсе текущие пары и отметки готовности подарков будут удалены. Участники и их вишлисты останутся, игра вернётся в режим регистрации.\n\nТочно сбросить?',
      buildConfirmResetKeyboard(),
    );
  });

  bot.callbackQuery('admin:reset_run', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;

    await store.resetDraw();
    await safeAnswerCallback(ctx, 'Пары удалены, регистрация открыта снова.');

    const participants = await store.listParticipants();
    for (const p of participants) {
      if (p.telegramId === admin.telegramId) continue;
      try {
        await bot.api.sendMessage(
          p.telegramId,
          '🔄 Организатор сбросил текущую жеребьёвку. Скоро будет проведена новая — можешь пока обновить свой вишлист через /menu.',
        );
      } catch {
        // Ignore delivery failures
      }
    }

    await renderAdminHome(ctx, admin.telegramId);
  });

  // --- Admin Nudge ---

  bot.callbackQuery('admin:nudge', async (ctx) => {
    const admin = await requireAdminCallback(ctx);
    if (!admin) return;

    const [game, participants] = await Promise.all([
      store.getGame(),
      store.listParticipants(),
    ]);

    const targets =
      game.status === 'registration'
        ? participants.filter((p) => !p.wishlist)
        : participants.filter((p) => !p.giftReady);

    if (targets.length === 0) {
      await safeAnswerCallback(
        ctx,
        game.status === 'registration'
          ? 'У всех уже заполнены вишлисты! 🎉'
          : 'Все уже отметили готовность подарков! 🎉',
        true,
      );
      return;
    }

    let sent = 0;
    for (const p of targets) {
      const msg =
        game.status === 'registration'
          ? '🎄 Напоминание от Тайного Санты: заполни, пожалуйста, свой вишлист в /menu — скоро жеребьёвка!'
          : '🎁 Напоминание от Тайного Санты: не забудь подготовить подарок и нажать «✅ Подарок готов» в /menu!';
      try {
        await bot.api.sendMessage(p.telegramId, msg);
        sent++;
      } catch {
        // Ignore blocked user
      }
    }

    await safeAnswerCallback(
      ctx,
      `Напоминание отправлено: ${sent} из ${targets.length} чел.`,
      true,
    );
  });

  // --- Text Message FSM Handling ---

  bot.on('message:text', async (ctx) => {
    const auth = await requireParticipantOrAdmin(ctx);
    if (!auth) return;

    const text = ctx.message.text.trim();
    if (text.startsWith('/')) {
      return;
    }

    const session = await store.getSession(auth.telegramId);

    switch (session.type) {
      case 'idle': {
        await renderHome(ctx, auth.telegramId);
        return;
      }

      case 'edit_name': {
        if (!auth.me) return;
        if (text.length === 0 || text.length > 60) {
          await ctx.reply('Имя должно быть от 1 до 60 символов. Попробуй ещё раз:');
          return;
        }
        await store.updateParticipantProfile(auth.telegramId, {
          displayName: text,
        });
        await store.setSession(auth.telegramId, { type: 'idle' });
        await ctx.reply(`✅ Имя обновлено: <b>${escapeHtml(text)}</b>`, {
          parse_mode: 'HTML',
        });
        await renderHome(ctx, auth.telegramId);
        return;
      }

      case 'edit_wishlist':
      case 'edit_antiwishlist': {
        if (!auth.me) return;
        if (text.length === 0 || text.length > 1500) {
          await ctx.reply(
            'Текст должен быть от 1 до 1500 символов. Попробуй покороче:',
          );
          return;
        }

        const patch =
          session.type === 'edit_wishlist'
            ? { wishlist: text }
            : { antiWishlist: text };
        await store.updateParticipantProfile(auth.telegramId, patch);
        await store.setSession(auth.telegramId, { type: 'idle' });

        // Notify Santa if draw already happened
        const game = await store.getGame();
        if (game.status === 'drawn') {
          const santa = await store.getSantaForRecipient(auth.me.id);
          if (santa) {
            try {
              await bot.api.sendMessage(
                santa.telegramId,
                `📝 Твой подопечный (<b>${escapeHtml(auth.me.displayName)}</b>) обновил ${session.type === 'edit_wishlist' ? 'вишлист' : 'пожелания по доставке/ограничениям'}! Проверь в /menu.`,
                { parse_mode: 'HTML' },
              );
            } catch {
              // Ignore
            }
          }
        }

        await ctx.reply('✅ Анкета сохранена!');
        await renderHome(ctx, auth.telegramId);
        return;
      }

      case 'msg_to_recipient': {
        if (!auth.me || !auth.me.recipientId) {
          await store.setSession(auth.telegramId, { type: 'idle' });
          return;
        }
        const recipient = await store.getParticipantById(auth.me.recipientId);
        if (!recipient) {
          await store.setSession(auth.telegramId, { type: 'idle' });
          await ctx.reply('Подопечный не найден.');
          return;
        }

        try {
          await bot.api.sendMessage(
            recipient.telegramId,
            `🎅 <b>Сообщение от твоего Тайного Санты:</b>\n\n${escapeHtml(text)}`,
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard().text(
                '↩️ Ответить Санте',
                'chat:to_santa',
              ),
            },
          );
          await store.setSession(auth.telegramId, { type: 'idle' });
          await ctx.reply('✅ Сообщение отправлено подопечному анонимно!');
        } catch {
          await store.setSession(auth.telegramId, { type: 'idle' });
          await ctx.reply(
            '❌ Не удалось доставить сообщение (возможно, получатель заблокировал бота).',
          );
        }
        await renderHome(ctx, auth.telegramId);
        return;
      }

      case 'msg_to_santa': {
        if (!auth.me) {
          await store.setSession(auth.telegramId, { type: 'idle' });
          return;
        }
        const santa = await store.getSantaForRecipient(auth.me.id);
        if (!santa) {
          await store.setSession(auth.telegramId, { type: 'idle' });
          await ctx.reply('Твой Санта не найден.');
          return;
        }

        try {
          await bot.api.sendMessage(
            santa.telegramId,
            `🎁 <b>Ответ от твоего подопечного (${escapeHtml(auth.me.displayName)}):</b>\n\n${escapeHtml(text)}`,
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard().text(
                '↩️ Ответить подопечному',
                'chat:to_recipient',
              ),
            },
          );
          await store.setSession(auth.telegramId, { type: 'idle' });
          await ctx.reply('✅ Ответ отправлен твоему Тайному Санте!');
        } catch {
          await store.setSession(auth.telegramId, { type: 'idle' });
          await ctx.reply(
            '❌ Не удалось доставить сообщение (возможно, твой Санта остановил бота).',
          );
        }
        await renderHome(ctx, auth.telegramId);
        return;
      }

      case 'admin_edit_title':
      case 'admin_edit_budget':
      case 'admin_edit_date': {
        if (!auth.isAdmin) {
          await store.setSession(auth.telegramId, { type: 'idle' });
          return;
        }
        if (text.length === 0 || text.length > 100) {
          await ctx.reply('Текст должен быть от 1 до 100 символов:');
          return;
        }

        if (session.type === 'admin_edit_title') {
          await store.updateGameSettings({ title: text });
        } else if (session.type === 'admin_edit_budget') {
          await store.updateGameSettings({ budget: text });
        } else {
          await store.updateGameSettings({ eventDate: text });
        }

        await store.setSession(auth.telegramId, { type: 'idle' });
        await ctx.reply('✅ Настройка сохранена!');
        const game = await store.getGame();
        await safeEditOrSend(
          ctx,
          `📝 <b>Настройки игры</b>\n\n${formatGameHeader(game)}`,
          buildAdminSettingsKeyboard(),
        );
        return;
      }
    }
  });

  // Fallback for non-text messages while waiting for text input
  bot.on('message', async (ctx) => {
    const auth = await requireParticipantOrAdmin(ctx);
    if (!auth) return;
    const session = await store.getSession(auth.telegramId);
    if (session.type !== 'idle') {
      await ctx.reply(
        'Пожалуйста, отправь обычное текстовое сообщение (или нажми ❌ Отмена).',
        { reply_markup: buildCancelKeyboard('menu:home') },
      );
    }
  });
}
