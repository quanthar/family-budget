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
  buildActionGamePickerKeyboard,
  buildAdminDeleteParticipantConfirmKeyboard,
  buildAdminExclusionsKeyboard,
  buildAdminHostInviteKeyboard,
  buildAdminInviteKeyboard,
  buildAdminKeyboard,
  buildAdminParticipantsKeyboard,
  buildAdminSettingsKeyboard,
  buildCancelKeyboard,
  buildConfirmDrawKeyboard,
  buildConfirmResetKeyboard,
  buildGamesListKeyboard,
  buildHomeKeyboard,
  buildPickExclusionDirectionKeyboard,
  buildPickGiverKeyboard,
  buildPickReceiverKeyboard,
  buildProfileViewKeyboard,
  buildWishlistPromptKeyboard,
} from './keyboards.js';

interface Deps {
  bot: Bot;
  store: SantaStore;
  config: AppConfig;
}

interface AuthContext {
  telegramId: string;
  userGames: GameSettings[];
  activeGame: GameSettings;
  me: Participant | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  canCreateGame: boolean;
}

const MAX_GAMES_REGULAR = 3;
const MAX_GAMES_SUPERADMIN = 10;

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

function isGameAdmin(
  config: AppConfig,
  game: GameSettings,
  telegramId: string,
): boolean {
  return (
    game.adminTelegramId === telegramId ||
    (game.id === 1 && config.adminTelegramIds.has(telegramId))
  );
}

function isSuperAdminUser(
  config: AppConfig,
  game1: GameSettings | null,
  telegramId: string,
): boolean {
  return (
    config.adminTelegramIds.has(telegramId) ||
    game1?.adminTelegramId === telegramId
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
  async function checkCreateEligibility(telegramId: string): Promise<{
    eligible: boolean;
    limitReached: boolean;
    isSuper: boolean;
  }> {
    const game1 = await store.getGame(1);
    const isSuper = isSuperAdminUser(config, game1, telegramId);
    const hostedCount = await store.countHostedGames(telegramId);

    if (isSuper) {
      return {
        eligible: true,
        limitReached: hostedCount >= MAX_GAMES_SUPERADMIN,
        isSuper: true,
      };
    }

    const [inMainGame, hasHostPass] = await Promise.all([
      store.isParticipantInGame(1, telegramId),
      store.isHostAllowed(telegramId),
    ]);

    if (!inMainGame && !hasHostPass) {
      return { eligible: false, limitReached: false, isSuper: false };
    }

    return {
      eligible: true,
      limitReached: hostedCount >= MAX_GAMES_REGULAR,
      isSuper: false,
    };
  }

  async function resolveAuth(
    ctx: Context,
    explicitGameId?: number,
  ): Promise<AuthContext | null> {
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

    const [userGames, session, game1, createCheck] = await Promise.all([
      store.listGamesForUser(telegramId),
      store.getSession(telegramId),
      store.getGame(1),
      checkCreateEligibility(telegramId),
    ]);

    const isSuper = createCheck.isSuper;

    // If super-admin hasn't created/joined any game yet, game 1 is still theirs
    const effectiveGames =
      userGames.length === 0 && isSuper && game1 ? [game1] : userGames;

    if (effectiveGames.length === 0) {
      return null;
    }

    const targetGame =
      (explicitGameId !== undefined
        ? effectiveGames.find((g) => g.id === explicitGameId)
        : undefined) ??
      (session.activeGameId !== null
        ? effectiveGames.find((g) => g.id === session.activeGameId)
        : undefined) ??
      effectiveGames[0];

    if (!targetGame) {
      return null;
    }

    const me = await store.getParticipantByTelegramId(targetGame.id, telegramId);
    const isAdmin = isGameAdmin(config, targetGame, telegramId);

    return {
      telegramId,
      userGames: effectiveGames,
      activeGame: targetGame,
      me,
      isAdmin,
      isSuperAdmin: isSuper,
      canCreateGame: createCheck.eligible && !createCheck.limitReached,
    };
  }

  async function denyUnauthorized(ctx: Context): Promise<void> {
    await safeAnswerCallback(
      ctx,
      'Доступ только по пригласительной ссылке от организатора.',
      true,
    );
    if (!ctx.callbackQuery) {
      await ctx.reply(
        '🔒 Это закрытый бот «Тайный Санта» для своей компании.\nЧтобы попасть в игру, перейди по пригласительной ссылке от организатора.',
      );
    }
  }

  async function renderHome(
    ctx: Context,
    telegramId: string,
    explicitGameId?: number,
  ): Promise<void> {
    const auth = await resolveAuth(ctx, explicitGameId);
    if (!auth) {
      await denyUnauthorized(ctx);
      return;
    }

    await store.setActiveGame(telegramId, auth.activeGame.id);

    if (!auth.me) {
      if (auth.isAdmin) {
        await renderAdminHome(ctx, telegramId, auth.activeGame.id);
        return;
      }
      await denyUnauthorized(ctx);
      return;
    }

    const participants = await store.listParticipants(auth.activeGame.id);
    const wishlistCount = participants.filter((p) => Boolean(p.wishlist)).length;
    const recipient =
      auth.activeGame.status === 'drawn' && auth.me.recipientId
        ? await store.getParticipantById(auth.me.recipientId)
        : null;

    const text = formatHomeMessage(
      auth.activeGame,
      auth.me,
      recipient,
      participants.length,
      wishlistCount,
    );
    const kb = buildHomeKeyboard({
      status: auth.activeGame.status,
      isAdmin: auth.isAdmin,
      giftReady: auth.me.giftReady,
      gamesCount: auth.userGames.length,
      canCreateGame: auth.canCreateGame,
    });
    await safeEditOrSend(ctx, text, kb);
  }

  async function renderAdminHome(
    ctx: Context,
    telegramId: string,
    explicitGameId?: number,
  ): Promise<void> {
    const auth = await resolveAuth(ctx, explicitGameId);
    if (!auth || !auth.isAdmin) {
      await safeAnswerCallback(ctx, 'Доступно только организатору.', true);
      return;
    }

    await store.setActiveGame(telegramId, auth.activeGame.id);

    const [participants, exclusions] = await Promise.all([
      store.listParticipants(auth.activeGame.id),
      store.listExclusions(auth.activeGame.id),
    ]);

    const grouped = groupExclusions(exclusions, participants);
    const text = formatAdminDashboard(
      auth.activeGame,
      participants,
      grouped.length,
    );
    const kb = buildAdminKeyboard({
      status: auth.activeGame.status,
      adminIsParticipant: Boolean(auth.me),
      isSuperAdmin: auth.isSuperAdmin,
      gamesCount: auth.userGames.length,
      canCreateGame: auth.canCreateGame,
    });
    await safeEditOrSend(ctx, text, kb);
  }

  async function renderGamesList(ctx: Context, telegramId: string): Promise<void> {
    const [userGames, session, createCheck] = await Promise.all([
      store.listGamesForUser(telegramId),
      store.getSession(telegramId),
      checkCreateEligibility(telegramId),
    ]);

    if (userGames.length === 0 && !createCheck.eligible) {
      await denyUnauthorized(ctx);
      return;
    }

    const lines = userGames.map((g, idx) => {
      const role = isGameAdmin(config, g, telegramId)
        ? '👑 Организатор'
        : '🎄 Участник';
      const status =
        g.status === 'registration' ? 'Регистрация' : 'Жеребьёвка проведена';
      return `${idx + 1}. <b>${escapeHtml(g.title)}</b> — ${role} (${status})`;
    });

    const text = [
      '🔀 <b>Твои игры «Тайный Санта»</b>',
      '',
      ...(lines.length > 0
        ? lines
        : ['<i>У тебя пока нет активных игр. Создай первую игру ниже!</i>']),
      '',
      'Выбери игру для перехода или создай новую:',
    ].join('\n');

    await safeEditOrSend(
      ctx,
      text,
      buildGamesListKeyboard({
        games: userGames,
        activeGameId: session.activeGameId,
        isAdminOf: (g) => isGameAdmin(config, g, telegramId),
        canCreateGame: createCheck.eligible && !createCheck.limitReached,
      }),
    );
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

    // 1. One-time admin claim for game 1 if ADMIN_TELEGRAM_ID env var is unset
    const game1 = await store.getGame(1);
    if (
      game1 &&
      config.adminTelegramIds.size === 0 &&
      !game1.adminTelegramId &&
      game1.adminClaimCode &&
      payload === game1.adminClaimCode
    ) {
      await store.claimAdmin(1, telegramId);
      await ctx.reply(
        `👑 Права организатора привязаны к твоему аккаунту!\nТвой Telegram ID: <code>${escapeHtml(telegramId)}</code>`,
        { parse_mode: 'HTML' },
      );
      await renderAdminHome(ctx, telegramId, 1);
      return;
    }

    // 2. Host creation pass (?start=host_...)
    const hostInviteCode = await store.getHostInviteCode();
    if (payload && payload === hostInviteCode) {
      await store.grantHostAccess(telegramId);
      const createCheck = await checkCreateEligibility(telegramId);
      if (createCheck.limitReached) {
        await ctx.reply(
          '⚠️ Доступ к созданию игр уже активен, но достигнут лимит твоих комнат.',
        );
        await renderGamesList(ctx, telegramId);
        return;
      }
      await store.setSessionState(telegramId, { type: 'create_game_title' });
      await ctx.reply(
        '🎫 <b>Доступ организатора открыт!</b>\n\nПридумай и отправь название для твоей новой игры «Тайный Санта» (например: <code>Санта для семьи 🎄</code>):',
        {
          parse_mode: 'HTML',
          reply_markup: buildCancelKeyboard('games:list'),
        },
      );
      return;
    }

    // 3. Room invite link (?start=<inviteCode>)
    if (payload) {
      const targetGame = await store.getGameByInviteCode(payload);
      if (targetGame) {
        const existing = await store.getParticipantByTelegramId(
          targetGame.id,
          telegramId,
        );
        if (existing) {
          await store.updateParticipantProfile(targetGame.id, telegramId, {
            username: ctx.from?.username ?? null,
          });
          await renderHome(ctx, telegramId, targetGame.id);
          return;
        }

        if (targetGame.status === 'drawn') {
          if (isGameAdmin(config, targetGame, telegramId)) {
            await renderAdminHome(ctx, telegramId, targetGame.id);
          } else {
            await ctx.reply(
              `🎄 В игре «${escapeHtml(targetGame.title)}» жеребьёвка уже проведена, регистрация закрыта.\nЕсли это ошибка — напиши организатору этой игры.`,
              { parse_mode: 'HTML' },
            );
          }
          return;
        }

        const { participant } = await store.upsertParticipant(targetGame.id, {
          telegramId,
          username: ctx.from?.username ?? null,
          displayName: defaultDisplayName(ctx),
        });

        await ctx.reply(
          `🎉 Добро пожаловать в «${escapeHtml(targetGame.title)}», <b>${escapeHtml(participant.displayName)}</b>!\nЗаполни свой вишлист в меню ниже.`,
          { parse_mode: 'HTML' },
        );
        await renderHome(ctx, telegramId, targetGame.id);
        return;
      }
    }

    // 4. Plain /start (or unknown code) -> open user's existing game or host creation
    const auth = await resolveAuth(ctx);
    if (auth) {
      await renderHome(ctx, telegramId, auth.activeGame.id);
      return;
    }

    const createCheck = await checkCreateEligibility(telegramId);
    if (createCheck.eligible) {
      await renderGamesList(ctx, telegramId);
      return;
    }

    await ctx.reply(
      '🔒 Это закрытый бот «Тайный Санта» для своей компании.\nПопроси у организатора актуальную ссылку-приглашение.',
    );
  });

  bot.command(['menu', 'santa'], async (ctx) => {
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;
    await renderHome(ctx, telegramId);
  });

  bot.command('games', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;
    await renderGamesList(ctx, telegramId);
  });

  bot.command('admin', async (ctx) => {
    const auth = await resolveAuth(ctx);
    if (!auth) {
      await denyUnauthorized(ctx);
      return;
    }
    if (!auth.isAdmin) {
      await ctx.reply(
        '⛔ В текущей игре ты участник, а не организатор.\nЕсли ты создавал свою игру — переключись на неё через /games.',
      );
      return;
    }
    await renderAdminHome(ctx, auth.telegramId, auth.activeGame.id);
  });

  bot.command('cancel', async (ctx) => {
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;
    await store.setSessionState(telegramId, { type: 'idle' });
    const auth = await resolveAuth(ctx);
    if (auth) {
      await ctx.reply('Действие отменено.');
      await renderHome(ctx, telegramId, auth.activeGame.id);
    } else {
      const createCheck = await checkCreateEligibility(telegramId);
      if (createCheck.eligible) {
        await ctx.reply('Действие отменено.');
        await renderGamesList(ctx, telegramId);
      }
    }
  });

  // --- Games Switching & Creation ---

  bot.callbackQuery('games:list', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;
    await safeAnswerCallback(ctx);
    await store.setSessionState(telegramId, { type: 'idle' });
    await renderGamesList(ctx, telegramId);
  });

  bot.callbackQuery(/^games:select:(\d+)$/, async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;
    const gameId = Number(ctx.match[1]);
    const auth = await resolveAuth(ctx, gameId);
    if (!auth) {
      await safeAnswerCallback(ctx, 'Нет доступа к этой игре.', true);
      return;
    }
    await safeAnswerCallback(ctx, `Открыта: ${auth.activeGame.title}`);
    await renderHome(ctx, telegramId, gameId);
  });

  bot.callbackQuery('games:create', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;

    const createCheck = await checkCreateEligibility(telegramId);
    if (!createCheck.eligible) {
      await safeAnswerCallback(
        ctx,
        'Создание игр доступно участникам основной игры или по спецссылке от владельца бота.',
        true,
      );
      return;
    }
    if (createCheck.limitReached) {
      await safeAnswerCallback(
        ctx,
        'Достигнут лимит созданных игр для одного аккаунта.',
        true,
      );
      return;
    }

    await safeAnswerCallback(ctx);
    await store.setSessionState(telegramId, { type: 'create_game_title' });

    const backCb =
      (await store.listGamesForUser(telegramId)).length > 0
        ? 'menu:home'
        : 'games:list';

    await safeEditOrSend(
      ctx,
      '🎄 <b>Новая игра «Тайный Санта»</b>\n\nНапиши название игры (например: <code>Семья Петровых 🎁</code> или <code>НГ с родственниками</code>):',
      buildCancelKeyboard(backCb),
    );
  });

  // --- Navigation Callbacks ---

  bot.callbackQuery('menu:home', async (ctx) => {
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;
    await safeAnswerCallback(ctx);
    await renderHome(ctx, telegramId);
  });

  async function showParticipantsList(ctx: Context, gameId: number): Promise<void> {
    const auth = await resolveAuth(ctx, gameId);
    if (!auth) {
      await denyUnauthorized(ctx);
      return;
    }
    await store.setActiveGame(auth.telegramId, gameId);

    const participants = await store.listParticipants(gameId);
    const lines = participants.map((p, idx) => {
      const wishMark = p.wishlist ? '📝' : '⏳';
      return `${idx + 1}. ${formatParticipantLabel(p)} ${wishMark}`;
    });

    const text = [
      `👥 <b>Участники «${escapeHtml(auth.activeGame.title)}» (${participants.length}):</b>`,
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
  }

  bot.callbackQuery('game:participants', async (ctx) => {
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;
    const pGames = await getParticipantGames(telegramId);
    if (pGames.length === 0) {
      await denyUnauthorized(ctx);
      return;
    }
    await safeAnswerCallback(ctx);
    if (pGames.length === 1) {
      await showParticipantsList(ctx, pGames[0].game.id);
      return;
    }
    await safeEditOrSend(
      ctx,
      '👥 <b>Для какой комнаты показать список участников?</b>',
      buildActionGamePickerKeyboard(
        pGames.map(({ game }) => ({ game })),
        'game:participants:g:',
      ),
    );
  });

  bot.callbackQuery(/^game:participants:g:(\d+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    await showParticipantsList(ctx, Number(ctx.match[1]));
  });

  // --- Profile Editing (with multi-room picker when user participates in >1 game) ---

  async function getParticipantGames(
    telegramId: string,
  ): Promise<Array<{ game: GameSettings; me: Participant }>> {
    const games = await store.listGamesForUser(telegramId);
    const result: Array<{ game: GameSettings; me: Participant }> = [];
    for (const game of games) {
      const me = await store.getParticipantByTelegramId(game.id, telegramId);
      if (me) result.push({ game, me });
    }
    return result;
  }

  async function openProfileView(ctx: Context, gameId: number): Promise<void> {
    const auth = await resolveAuth(ctx, gameId);
    if (!auth || !auth.me) return;
    await store.setActiveGame(auth.telegramId, gameId);
    await safeEditOrSend(
      ctx,
      `<b>${escapeHtml(auth.activeGame.title)}</b>\n\n${formatMyProfileBlock(auth.me)}`,
      buildProfileViewKeyboard(gameId),
    );
  }

  async function openEditName(ctx: Context, gameId: number): Promise<void> {
    const auth = await resolveAuth(ctx, gameId);
    if (!auth || !auth.me) return;
    await store.setActiveGame(auth.telegramId, gameId);
    await store.setSessionState(auth.telegramId, {
      type: 'edit_name',
      gameId,
    });
    await safeEditOrSend(
      ctx,
      `✏️ Сейчас твоё имя в «${escapeHtml(auth.activeGame.title)}»: <b>${escapeHtml(auth.me.displayName)}</b>\n\nОтправь новое имя (как тебя знают в этой компании):`,
      buildCancelKeyboard('menu:home'),
    );
  }

  async function openEditWishlist(ctx: Context, gameId: number): Promise<void> {
    const auth = await resolveAuth(ctx, gameId);
    if (!auth || !auth.me) return;
    await store.setActiveGame(auth.telegramId, gameId);
    await store.setSessionState(auth.telegramId, {
      type: 'edit_wishlist',
      gameId,
      append: false,
    });
    const current = auth.me.wishlist
      ? `\n\nСейчас указано (нажми, чтобы скопировать):\n<code>${escapeHtml(auth.me.wishlist)}</code>`
      : '';
    await safeEditOrSend(
      ctx,
      `🎁 <b>${escapeHtml(auth.activeGame.title)}</b>\n\nОтправь новый текст вишлиста (он заменит старый) или нажми «➕ Дописать в конец», чтобы добавить подарки к существующему списку:${current}`,
      buildWishlistPromptKeyboard(Boolean(auth.me.wishlist), gameId, 'menu:home'),
    );
  }

  async function openAppendWishlist(
    ctx: Context,
    gameId: number,
  ): Promise<void> {
    const auth = await resolveAuth(ctx, gameId);
    if (!auth || !auth.me) return;
    await store.setActiveGame(auth.telegramId, gameId);
    await store.setSessionState(auth.telegramId, {
      type: 'edit_wishlist',
      gameId,
      append: true,
    });
    const current = auth.me.wishlist
      ? `\n\nТекущий список:\n<i>${escapeHtml(auth.me.wishlist)}</i>`
      : '';
    await safeEditOrSend(
      ctx,
      `➕ <b>${escapeHtml(auth.activeGame.title)}</b>\n\nОтправь, что <b>добавить</b> к твоему вишлисту (мы допишем это с новой строки):${current}`,
      buildCancelKeyboard('menu:home'),
    );
  }

  async function openEditAnti(ctx: Context, gameId: number): Promise<void> {
    const auth = await resolveAuth(ctx, gameId);
    if (!auth || !auth.me) return;
    await store.setActiveGame(auth.telegramId, gameId);
    await store.setSessionState(auth.telegramId, {
      type: 'edit_antiwishlist',
      gameId,
    });
    const current = auth.me.antiWishlist
      ? `\n\nСейчас указано:\n<code>${escapeHtml(auth.me.antiWishlist)}</code>`
      : '';
    await safeEditOrSend(
      ctx,
      `🚫 <b>${escapeHtml(auth.activeGame.title)}</b>\n\nНапиши, что точно НЕ стоит дарить (аллергии, нелюбимое), и можешь указать удобный ПВЗ / способ доставки:${current}`,
      buildCancelKeyboard('menu:home'),
    );
  }

  async function toggleGiftReadyForGame(
    ctx: Context,
    gameId: number,
  ): Promise<void> {
    const auth = await resolveAuth(ctx, gameId);
    if (!auth || !auth.me) return;

    if (auth.activeGame.status !== 'drawn' || !auth.me.recipientId) {
      await safeAnswerCallback(
        ctx,
        `В игре «${auth.activeGame.title}» жеребьёвка ещё не проведена.`,
        true,
      );
      return;
    }

    const nextReady = !auth.me.giftReady;
    await store.setGiftReady(gameId, auth.telegramId, nextReady);
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
            `🎁 <b>Отличные новости!</b> <i>(${escapeHtml(auth.activeGame.title)})</i>\nТвой Тайный Санта отметил, что подарок уже готов или отправлен!`,
            { parse_mode: 'HTML' },
          );
        } catch {
          // Ignore if recipient blocked bot
        }
      }
    }

    await renderHome(ctx, auth.telegramId, gameId);
  }

  bot.callbackQuery('profile:view', async (ctx) => {
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;
    const pGames = await getParticipantGames(telegramId);
    if (pGames.length === 0) return;
    await safeAnswerCallback(ctx);
    if (pGames.length === 1) {
      await openProfileView(ctx, pGames[0].game.id);
      return;
    }
    await safeEditOrSend(
      ctx,
      '📝 <b>Для какой комнаты открыть анкету?</b>',
      buildActionGamePickerKeyboard(
        pGames.map(({ game }) => ({ game })),
        'profile:view:g:',
      ),
    );
  });

  bot.callbackQuery(/^profile:view:g:(\d+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    await openProfileView(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery('profile:name', async (ctx) => {
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;
    const pGames = await getParticipantGames(telegramId);
    if (pGames.length === 0) return;
    await safeAnswerCallback(ctx);
    if (pGames.length === 1) {
      await openEditName(ctx, pGames[0].game.id);
      return;
    }
    await safeEditOrSend(
      ctx,
      '✏️ <b>Для какой комнаты изменить твоё имя?</b>',
      buildActionGamePickerKeyboard(
        pGames.map(({ game, me }) => ({
          game,
          labelSuffix: `(${me.displayName})`,
        })),
        'profile:name:g:',
      ),
    );
  });

  bot.callbackQuery(/^profile:name:g:(\d+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    await openEditName(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery('profile:wishlist', async (ctx) => {
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;
    const pGames = await getParticipantGames(telegramId);
    if (pGames.length === 0) return;
    await safeAnswerCallback(ctx);
    if (pGames.length === 1) {
      await openEditWishlist(ctx, pGames[0].game.id);
      return;
    }
    await safeEditOrSend(
      ctx,
      '🎁 <b>Для какой комнаты изменить / дополнить вишлист?</b>',
      buildActionGamePickerKeyboard(
        pGames.map(({ game, me }) => ({
          game,
          labelSuffix: me.wishlist ? '📝' : '⏳',
        })),
        'profile:wishlist:g:',
      ),
    );
  });

  bot.callbackQuery(/^profile:wishlist:g:(\d+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    await openEditWishlist(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery('profile:wishlist_append', async (ctx) => {
    const auth = await resolveAuth(ctx);
    if (!auth || !auth.me) return;
    await safeAnswerCallback(ctx);
    await openAppendWishlist(ctx, auth.activeGame.id);
  });

  bot.callbackQuery(/^profile:wishlist_append:g:(\d+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    await openAppendWishlist(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery('profile:anti', async (ctx) => {
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;
    const pGames = await getParticipantGames(telegramId);
    if (pGames.length === 0) return;
    await safeAnswerCallback(ctx);
    if (pGames.length === 1) {
      await openEditAnti(ctx, pGames[0].game.id);
      return;
    }
    await safeEditOrSend(
      ctx,
      '🚫 <b>Для какой комнаты указать, что не дарить / доставку?</b>',
      buildActionGamePickerKeyboard(
        pGames.map(({ game }) => ({ game })),
        'profile:anti:g:',
      ),
    );
  });

  bot.callbackQuery(/^profile:anti:g:(\d+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    await openEditAnti(ctx, Number(ctx.match[1]));
  });

  // --- Gift Ready Toggle ---

  bot.callbackQuery('gift:toggle', async (ctx) => {
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;
    const pGames = await getParticipantGames(telegramId);
    if (pGames.length === 0) return;

    if (pGames.length === 1) {
      await toggleGiftReadyForGame(ctx, pGames[0].game.id);
      return;
    }

    await safeAnswerCallback(ctx);
    await safeEditOrSend(
      ctx,
      '🎁 <b>Для какой комнаты изменить статус готовности подарка?</b>',
      buildActionGamePickerKeyboard(
        pGames.map(({ game, me }) => ({
          game,
          labelSuffix:
            game.status !== 'drawn'
              ? '(⏳ ждёт жеребьёвки)'
              : me.giftReady
                ? '(✅ готов)'
                : '(⏳ в процессе)',
        })),
        'gift:toggle:g:',
      ),
    );
  });

  bot.callbackQuery(/^gift:toggle:g:(\d+)$/, async (ctx) => {
    await toggleGiftReadyForGame(ctx, Number(ctx.match[1]));
  });

  // --- Anonymous Chat (multi-room picker from menu + direct gameId on incoming letters) ---

  async function startChatToRecipient(
    ctx: Context,
    explicitGameId: number,
    replaceMessage: boolean,
  ): Promise<void> {
    const auth = await resolveAuth(ctx, explicitGameId);
    if (!auth || !auth.me) {
      await safeAnswerCallback(ctx, 'Участник в этой игре не найден.', true);
      return;
    }
    if (auth.activeGame.status !== 'drawn' || !auth.me.recipientId) {
      await safeAnswerCallback(
        ctx,
        `В игре «${auth.activeGame.title}» жеребьёвка ещё не проведена.`,
        true,
      );
      return;
    }
    const recipient = await store.getParticipantById(auth.me.recipientId);
    if (!recipient) {
      await safeAnswerCallback(ctx, 'Подопечный не найден.', true);
      return;
    }

    await safeAnswerCallback(ctx);
    await store.setActiveGame(auth.telegramId, explicitGameId);
    await store.setSessionState(auth.telegramId, {
      type: 'msg_to_recipient',
      gameId: explicitGameId,
    });

    const prompt = `✉️ Напиши анонимное сообщение для <b>${escapeHtml(recipient.displayName)}</b> <i>(${escapeHtml(auth.activeGame.title)})</i>.\nТвоё имя не будет раскрыто.`;
    if (replaceMessage) {
      await safeEditOrSend(ctx, prompt, buildCancelKeyboard('menu:home'));
    } else {
      await ctx.reply(prompt, {
        parse_mode: 'HTML',
        reply_markup: buildCancelKeyboard('menu:home'),
      });
    }
  }

  async function startChatToSanta(
    ctx: Context,
    explicitGameId: number,
    replaceMessage: boolean,
  ): Promise<void> {
    const auth = await resolveAuth(ctx, explicitGameId);
    if (!auth || !auth.me) {
      await safeAnswerCallback(ctx, 'Участник в этой игре не найден.', true);
      return;
    }
    if (auth.activeGame.status !== 'drawn') {
      await safeAnswerCallback(
        ctx,
        `В игре «${auth.activeGame.title}» жеребьёвка ещё не проведена.`,
        true,
      );
      return;
    }
    const santa = await store.getSantaForRecipient(auth.me.id);
    if (!santa) {
      await safeAnswerCallback(ctx, 'Твой Санта ещё не назначен.', true);
      return;
    }

    await safeAnswerCallback(ctx);
    await store.setActiveGame(auth.telegramId, explicitGameId);
    await store.setSessionState(auth.telegramId, {
      type: 'msg_to_santa',
      gameId: explicitGameId,
    });

    const prompt = `🎅 Напиши сообщение своему Тайному Санте <i>(${escapeHtml(auth.activeGame.title)})</i> — я перешлю его без раскрытия (Санта увидит только, что это от его подопечного):`;
    if (replaceMessage) {
      await safeEditOrSend(ctx, prompt, buildCancelKeyboard('menu:home'));
    } else {
      await ctx.reply(prompt, {
        parse_mode: 'HTML',
        reply_markup: buildCancelKeyboard('menu:home'),
      });
    }
  }

  bot.callbackQuery('chat:to_recipient', async (ctx) => {
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;
    const pGames = await getParticipantGames(telegramId);
    if (pGames.length === 0) return;
    if (pGames.length === 1) {
      await startChatToRecipient(ctx, pGames[0].game.id, false);
      return;
    }

    await safeAnswerCallback(ctx);
    const items = await Promise.all(
      pGames.map(async ({ game, me }) => {
        if (game.status !== 'drawn' || !me.recipientId) {
          return { game, labelSuffix: '(⏳ ждёт жеребьёвки)' };
        }
        const rec = await store.getParticipantById(me.recipientId);
        return {
          game,
          labelSuffix: rec ? `(🎯 ${rec.displayName})` : undefined,
        };
      }),
    );

    await safeEditOrSend(
      ctx,
      '✉️ <b>Для какой комнаты написать твоему подопечному?</b>',
      buildActionGamePickerKeyboard(items, 'chat:to_recipient:g:'),
    );
  });

  bot.callbackQuery(/^chat:to_recipient:g:(\d+)$/, (ctx) =>
    startChatToRecipient(ctx, Number(ctx.match[1]), true),
  );
  bot.callbackQuery(/^chat:to_recipient:(\d+)$/, (ctx) =>
    startChatToRecipient(ctx, Number(ctx.match[1]), false),
  );

  bot.callbackQuery('chat:to_santa', async (ctx) => {
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;
    const pGames = await getParticipantGames(telegramId);
    if (pGames.length === 0) return;
    if (pGames.length === 1) {
      await startChatToSanta(ctx, pGames[0].game.id, false);
      return;
    }

    await safeAnswerCallback(ctx);
    await safeEditOrSend(
      ctx,
      '🎅 <b>Для какой комнаты написать твоему Тайному Санте?</b>',
      buildActionGamePickerKeyboard(
        pGames.map(({ game }) => ({
          game,
          labelSuffix:
            game.status === 'drawn' ? '(🎉)' : '(⏳ ждёт жеребьёвки)',
        })),
        'chat:to_santa:g:',
      ),
    );
  });

  bot.callbackQuery(/^chat:to_santa:g:(\d+)$/, (ctx) =>
    startChatToSanta(ctx, Number(ctx.match[1]), true),
  );
  bot.callbackQuery(/^chat:to_santa:(\d+)$/, (ctx) =>
    startChatToSanta(ctx, Number(ctx.match[1]), false),
  );

  // --- Admin Panel ---

  async function requireAdminCallback(ctx: Context): Promise<AuthContext | null> {
    const auth = await resolveAuth(ctx);
    if (!auth) {
      await denyUnauthorized(ctx);
      return null;
    }
    if (!auth.isAdmin) {
      await safeAnswerCallback(ctx, 'Доступно только организатору этой игры.', true);
      return null;
    }
    return auth;
  }

  bot.callbackQuery('admin:home', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    await safeAnswerCallback(ctx);
    await renderAdminHome(ctx, auth.telegramId, auth.activeGame.id);
  });

  bot.callbackQuery('admin:join_self', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    if (auth.activeGame.status === 'drawn') {
      await safeAnswerCallback(
        ctx,
        'Жеребьёвка уже проведена — сначала сбрось пары, чтобы добавить себя.',
        true,
      );
      return;
    }
    await store.upsertParticipant(auth.activeGame.id, {
      telegramId: auth.telegramId,
      username: ctx.from?.username ?? null,
      displayName: defaultDisplayName(ctx),
    });
    await safeAnswerCallback(ctx, 'Ты добавлен в список участников! 🎄');
    await renderHome(ctx, auth.telegramId, auth.activeGame.id);
  });

  bot.callbackQuery('admin:invite', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    await safeAnswerCallback(ctx);

    const botUsername = bot.botInfo?.username;
    const link = botUsername
      ? `https://t.me/${botUsername}?start=${auth.activeGame.inviteCode}`
      : `Код приглашения: ${auth.activeGame.inviteCode}`;

    const text = [
      `🔗 <b>Приглашение в игру «${escapeHtml(auth.activeGame.title)}»</b>`,
      '',
      'Отправь эту ссылку участникам вашей игры:',
      `<code>${escapeHtml(link)}</code>`,
      '',
      'По этой ссылке люди попадут только в эту комнату и не увидят другие игры.',
    ].join('\n');

    await safeEditOrSend(ctx, text, buildAdminInviteKeyboard());
  });

  bot.callbackQuery('admin:invite:regen', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;

    const newCode = crypto.randomBytes(6).toString('base64url');
    const game = await store.updateGameSettings(auth.activeGame.id, {
      inviteCode: newCode,
    });
    await safeAnswerCallback(ctx, 'Инвайт-код обновлён!');

    const botUsername = bot.botInfo?.username;
    const link = botUsername
      ? `https://t.me/${botUsername}?start=${game.inviteCode}`
      : `Код приглашения: ${game.inviteCode}`;

    const text = [
      `🔗 <b>Новая ссылка для «${escapeHtml(game.title)}»</b>`,
      '',
      `<code>${escapeHtml(link)}</code>`,
      '',
      'Старая ссылка больше не действует (уже вошедшие участники остаются в игре).',
    ].join('\n');

    await safeEditOrSend(ctx, text, buildAdminInviteKeyboard());
  });

  // --- Super-admin Host Invite Link (for friends outside game 1) ---

  bot.callbackQuery('admin:host_invite', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth || !auth.isSuperAdmin) {
      await safeAnswerCallback(ctx, 'Доступно только владельцу бота.', true);
      return;
    }
    await safeAnswerCallback(ctx);

    const code = await store.getHostInviteCode();
    const botUsername = bot.botInfo?.username;
    const link = botUsername
      ? `https://t.me/${botUsername}?start=${code}`
      : `Код: ${code}`;

    const text = [
      '🎫 <b>Ссылка-пропуск для создания своей игры</b>',
      '',
      'Твои друзья из основной игры уже видят кнопку «➕ Создать свою игру» у себя в меню.',
      'А эту ссылку можно отправить знакомым, которых нет в твоей игре — они смогут создать свою отдельную комнату для семьи/друзей:',
      '',
      `<code>${escapeHtml(link)}</code>`,
    ].join('\n');

    await safeEditOrSend(ctx, text, buildAdminHostInviteKeyboard());
  });

  bot.callbackQuery('admin:host_invite:regen', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth || !auth.isSuperAdmin) {
      await safeAnswerCallback(ctx, 'Доступно только владельцу бота.', true);
      return;
    }

    const code = await store.regenerateHostInviteCode();
    await safeAnswerCallback(ctx, 'Ссылка-пропуск обновлена!');

    const botUsername = bot.botInfo?.username;
    const link = botUsername
      ? `https://t.me/${botUsername}?start=${code}`
      : `Код: ${code}`;

    const text = [
      '🎫 <b>Новая ссылка-пропуск для создания игры</b>',
      '',
      `<code>${escapeHtml(link)}</code>`,
      '',
      'Старая ссылка-пропуск больше не действует.',
    ].join('\n');

    await safeEditOrSend(ctx, text, buildAdminHostInviteKeyboard());
  });

  // --- Admin Settings ---

  bot.callbackQuery('admin:settings', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    await safeAnswerCallback(ctx);
    await safeEditOrSend(
      ctx,
      `📝 <b>Настройки игры</b>\n\n${formatGameHeader(auth.activeGame)}`,
      buildAdminSettingsKeyboard(),
    );
  });

  bot.callbackQuery('admin:set_title', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    await safeAnswerCallback(ctx);
    await store.setSessionState(auth.telegramId, {
      type: 'admin_edit_title',
      gameId: auth.activeGame.id,
    });
    await safeEditOrSend(
      ctx,
      '✏️ Отправь новое название игры (например: <code>Тайный Санта 2027 🎄</code>):',
      buildCancelKeyboard('admin:settings'),
    );
  });

  bot.callbackQuery('admin:set_budget', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    await safeAnswerCallback(ctx);
    await store.setSessionState(auth.telegramId, {
      type: 'admin_edit_budget',
      gameId: auth.activeGame.id,
    });
    await safeEditOrSend(
      ctx,
      '💰 Отправь рекомендуемый бюджет подарка (например: <code>до 2000 ₽</code>):',
      buildCancelKeyboard('admin:settings'),
    );
  });

  bot.callbackQuery('admin:clear_budget', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    const game = await store.updateGameSettings(auth.activeGame.id, {
      budget: null,
    });
    await safeAnswerCallback(ctx, 'Бюджет убран.');
    await safeEditOrSend(
      ctx,
      `📝 <b>Настройки игры</b>\n\n${formatGameHeader(game)}`,
      buildAdminSettingsKeyboard(),
    );
  });

  bot.callbackQuery('admin:set_date', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    await safeAnswerCallback(ctx);
    await store.setSessionState(auth.telegramId, {
      type: 'admin_edit_date',
      gameId: auth.activeGame.id,
    });
    await safeEditOrSend(
      ctx,
      '📅 Отправь дату или место обмена подарками (например: <code>28 декабря, дома</code>):',
      buildCancelKeyboard('admin:settings'),
    );
  });

  bot.callbackQuery('admin:clear_date', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    const game = await store.updateGameSettings(auth.activeGame.id, {
      eventDate: null,
    });
    await safeAnswerCallback(ctx, 'Дата убрана.');
    await safeEditOrSend(
      ctx,
      `📝 <b>Настройки игры</b>\n\n${formatGameHeader(game)}`,
      buildAdminSettingsKeyboard(),
    );
  });

  // --- Admin Participants Removal ---

  bot.callbackQuery('admin:participants', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    await safeAnswerCallback(ctx);

    const participants = await store.listParticipants(auth.activeGame.id);
    const lines = participants.map(
      (p, i) => `${i + 1}. ${formatParticipantLabel(p)} ${p.wishlist ? '📝' : '⏳'}`,
    );

    const text = [
      `👥 <b>Участники «${escapeHtml(auth.activeGame.title)}» (${participants.length})</b>`,
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
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    const id = Number(ctx.match[1]);
    const target = await store.getParticipantById(id);
    if (!target || target.gameId !== auth.activeGame.id) {
      await safeAnswerCallback(ctx, 'Участник уже удалён.', true);
      return;
    }

    await safeAnswerCallback(ctx);

    const warning =
      auth.activeGame.status === 'drawn'
        ? '\n\n⚠️ <b>Жеребьёвка уже проведена!</b> Удаление участника разорвёт пару — после этого лучше сбросить жеребьёвку и провести её заново.'
        : '';

    await safeEditOrSend(
      ctx,
      `Удалить участника <b>${formatParticipantLabel(target)}</b>?${warning}`,
      buildAdminDeleteParticipantConfirmKeyboard(id),
    );
  });

  bot.callbackQuery(/^admin:del_user_do:(\d+)$/, async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    const id = Number(ctx.match[1]);
    await store.removeParticipant(auth.activeGame.id, id);
    await safeAnswerCallback(ctx, 'Участник удалён.');

    const participants = await store.listParticipants(auth.activeGame.id);
    const lines = participants.map(
      (p, i) => `${i + 1}. ${formatParticipantLabel(p)} ${p.wishlist ? '📝' : '⏳'}`,
    );
    await safeEditOrSend(
      ctx,
      [
        `👥 <b>Участники «${escapeHtml(auth.activeGame.title)}» (${participants.length})</b>`,
        '',
        ...(lines.length > 0 ? lines : ['<i>Пока никого нет</i>']),
      ].join('\n'),
      buildAdminParticipantsKeyboard(participants),
    );
  });

  // --- Admin Exclusions (Forbidden Pairs) ---

  async function renderAdminExclusions(
    ctx: Context,
    gameId: number,
  ): Promise<void> {
    const [participants, exclusions] = await Promise.all([
      store.listParticipants(gameId),
      store.listExclusions(gameId),
    ]);
    const grouped = groupExclusions(exclusions, participants);

    const lines = grouped.map((g, idx) => {
      const arrow = g.mutual ? '↔' : '→';
      const desc = g.mutual ? 'не дарят друг другу' : 'не дарит';
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
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    await safeAnswerCallback(ctx);
    await renderAdminExclusions(ctx, auth.activeGame.id);
  });

  bot.callbackQuery('admin:ex_add', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    const participants = await store.listParticipants(auth.activeGame.id);
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
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    const giverId = Number(ctx.match[1]);
    const participants = await store.listParticipants(auth.activeGame.id);
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
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    const giverId = Number(ctx.match[1]);
    const receiverId = Number(ctx.match[2]);
    const [giver, receiver] = await Promise.all([
      store.getParticipantById(giverId),
      store.getParticipantById(receiverId),
    ]);
    if (
      !giver ||
      !receiver ||
      giver.gameId !== auth.activeGame.id ||
      receiver.gameId !== auth.activeGame.id
    ) {
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
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    const giverId = Number(ctx.match[1]);
    const receiverId = Number(ctx.match[2]);
    const mutual = ctx.match[3] === '1';

    const [giver, receiver] = await Promise.all([
      store.getParticipantById(giverId),
      store.getParticipantById(receiverId),
    ]);
    if (
      !giver ||
      !receiver ||
      giver.gameId !== auth.activeGame.id ||
      receiver.gameId !== auth.activeGame.id
    ) {
      await safeAnswerCallback(ctx, 'Участник не найден.', true);
      return;
    }

    await store.addExclusion(auth.activeGame.id, giverId, receiverId, mutual);
    await safeAnswerCallback(ctx, 'Пара-исключение добавлена!');
    await renderAdminExclusions(ctx, auth.activeGame.id);
  });

  bot.callbackQuery(/^admin:ex_del:([\d_]+)$/, async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    const ids = ctx.match[1]
      .split('_')
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);

    for (const id of ids) {
      await store.removeExclusion(auth.activeGame.id, id);
    }
    await safeAnswerCallback(ctx, 'Исключение удалено!');
    await renderAdminExclusions(ctx, auth.activeGame.id);
  });

  // --- Admin Draw & Reset ---

  bot.callbackQuery('admin:draw_confirm', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;

    const [participants, exclusions] = await Promise.all([
      store.listParticipants(auth.activeGame.id),
      store.listExclusions(auth.activeGame.id),
    ]);

    if (auth.activeGame.status === 'drawn') {
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
      `🎲 <b>Запуск жеребьёвки — «${escapeHtml(auth.activeGame.title)}»</b>`,
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
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;

    const game = auth.activeGame;
    const [participants, exclusions] = await Promise.all([
      store.listParticipants(game.id),
      store.listExclusions(game.id),
    ]);

    if (game.status === 'drawn') {
      await safeAnswerCallback(ctx, 'Жеребьёвка уже была проведена!', true);
      await renderAdminHome(ctx, auth.telegramId, game.id);
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

    const updatedGame = await store.applyDraw(game.id, assignments);
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
      const isGiverAdmin = isGameAdmin(config, updatedGame, giver.telegramId);
      const [giverGames, giverCreate] = await Promise.all([
        store.listGamesForUser(giver.telegramId),
        checkCreateEligibility(giver.telegramId),
      ]);

      await store.setActiveGame(giver.telegramId, updatedGame.id);

      const messageText = [
        `🎉 <b>Жеребьёвка «${escapeHtml(updatedGame.title)}» прошла!</b>`,
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
          reply_markup: buildHomeKeyboard({
            status: 'drawn',
            isAdmin: isGiverAdmin,
            giftReady: false,
            gamesCount: giverGames.length,
            canCreateGame: giverCreate.eligible && !giverCreate.limitReached,
          }),
          link_preview_options: { is_disabled: true },
        });
        delivered++;
      } catch {
        failedNames.push(giver.displayName);
      }
    }

    const reportLines = [
      `✅ <b>Жеребьёвка «${escapeHtml(updatedGame.title)}» успешно проведена!</b>`,
      `Уведомления доставлены: <b>${delivered}/${assignments.length}</b>.`,
    ];
    if (failedNames.length > 0) {
      reportLines.push(
        `⚠️ Не удалось отправить сообщение: ${failedNames.map(escapeHtml).join(', ')} (возможно, бот остановлен у них в ЛС; пусть откроют /menu).`,
      );
    }

    await ctx.reply(reportLines.join('\n'), { parse_mode: 'HTML' });
    await renderAdminHome(ctx, auth.telegramId, updatedGame.id);
  });

  bot.callbackQuery('admin:reset_confirm', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;
    await safeAnswerCallback(ctx);
    await safeEditOrSend(
      ctx,
      `⚠️ <b>Сброс жеребьёвки — «${escapeHtml(auth.activeGame.title)}»</b>\n\nВсе текущие пары и отметки готовности подарков в этой игре будут удалены. Участники и их вишлисты останутся, игра вернётся в режим регистрации.\n\nТочно сбросить?`,
      buildConfirmResetKeyboard(),
    );
  });

  bot.callbackQuery('admin:reset_run', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;

    await store.resetDraw(auth.activeGame.id);
    await safeAnswerCallback(ctx, 'Пары удалены, регистрация открыта снова.');

    const participants = await store.listParticipants(auth.activeGame.id);
    for (const p of participants) {
      if (p.telegramId === auth.telegramId) continue;
      try {
        await bot.api.sendMessage(
          p.telegramId,
          `🔄 Организатор сбросил жеребьёвку в игре «${escapeHtml(auth.activeGame.title)}». Скоро будет проведена новая — можешь пока обновить свой вишлист через /menu.`,
          { parse_mode: 'HTML' },
        );
      } catch {
        // Ignore delivery failures
      }
    }

    await renderAdminHome(ctx, auth.telegramId, auth.activeGame.id);
  });

  // --- Admin Nudge ---

  bot.callbackQuery('admin:nudge', async (ctx) => {
    const auth = await requireAdminCallback(ctx);
    if (!auth) return;

    const participants = await store.listParticipants(auth.activeGame.id);
    const targets =
      auth.activeGame.status === 'registration'
        ? participants.filter((p) => !p.wishlist)
        : participants.filter((p) => !p.giftReady);

    if (targets.length === 0) {
      await safeAnswerCallback(
        ctx,
        auth.activeGame.status === 'registration'
          ? 'У всех уже заполнены вишлисты! 🎉'
          : 'Все уже отметили готовность подарков! 🎉',
        true,
      );
      return;
    }

    let sent = 0;
    for (const p of targets) {
      const msg =
        auth.activeGame.status === 'registration'
          ? `🎄 Напоминание по игре «${escapeHtml(auth.activeGame.title)}»: заполни, пожалуйста, свой вишлист в /menu — скоро жеребьёвка!`
          : `🎁 Напоминание по игре «${escapeHtml(auth.activeGame.title)}»: не забудь подготовить подарок и нажать «✅ Подарок готов» в /menu!`;
      try {
        await bot.api.sendMessage(p.telegramId, msg, { parse_mode: 'HTML' });
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
    if (ctx.chat?.type !== 'private') return;
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;

    const text = ctx.message.text.trim();
    if (text.startsWith('/')) {
      return;
    }

    const session = await store.getSession(telegramId);
    const state = session.state;

    if (state.type === 'create_game_title') {
      const createCheck = await checkCreateEligibility(telegramId);
      if (!createCheck.eligible || createCheck.limitReached) {
        await store.setSessionState(telegramId, { type: 'idle' });
        await ctx.reply('⛔ Создание игры сейчас недоступно.');
        return;
      }

      if (text.length === 0 || text.length > 80) {
        await ctx.reply(
          'Название игры должно быть от 1 до 80 символов. Попробуй ещё раз:',
        );
        return;
      }

      const inviteCode = crypto.randomBytes(6).toString('base64url');
      const newGame = await store.createGame({
        title: text,
        adminTelegramId: telegramId,
        inviteCode,
      });

      await store.setActiveGame(telegramId, newGame.id);

      const botUsername = bot.botInfo?.username;
      const link = botUsername
        ? `https://t.me/${botUsername}?start=${newGame.inviteCode}`
        : `Код: ${newGame.inviteCode}`;

      await ctx.reply(
        [
          `🎉 Игра <b>«${escapeHtml(newGame.title)}»</b> создана!`,
          '',
          '🔗 Ссылка-приглашение для участников:',
          `<code>${escapeHtml(link)}</code>`,
          '',
          'Если ты тоже будешь участвовать — нажми «🎄 Присоединиться к игре» в админке ниже.',
        ].join('\n'),
        { parse_mode: 'HTML' },
      );

      await renderAdminHome(ctx, telegramId, newGame.id);
      return;
    }

    const explicitGameId =
      'gameId' in state ? state.gameId : undefined;
    const auth = await resolveAuth(ctx, explicitGameId);
    if (!auth) {
      await denyUnauthorized(ctx);
      return;
    }

    switch (state.type) {
      case 'idle': {
        await renderHome(ctx, telegramId, auth.activeGame.id);
        return;
      }

      case 'edit_name': {
        if (!auth.me) return;
        if (text.length === 0 || text.length > 60) {
          await ctx.reply('Имя должно быть от 1 до 60 символов. Попробуй ещё раз:');
          return;
        }
        await store.updateParticipantProfile(auth.activeGame.id, telegramId, {
          displayName: text,
        });
        await store.setSessionState(telegramId, { type: 'idle' });
        await ctx.reply(`✅ Имя обновлено: <b>${escapeHtml(text)}</b>`, {
          parse_mode: 'HTML',
        });
        await renderHome(ctx, telegramId, auth.activeGame.id);
        return;
      }

      case 'edit_wishlist':
      case 'edit_antiwishlist': {
        if (!auth.me) return;

        let nextText = text;
        if (
          state.type === 'edit_wishlist' &&
          state.append &&
          auth.me.wishlist
        ) {
          nextText = `${auth.me.wishlist}\n${text}`;
        }

        if (nextText.length === 0 || nextText.length > 1500) {
          await ctx.reply(
            'Текст должен быть от 1 до 1500 символов (включая старый список). Попробуй покороче:',
          );
          return;
        }

        const patch =
          state.type === 'edit_wishlist'
            ? { wishlist: nextText }
            : { antiWishlist: nextText };
        await store.updateParticipantProfile(
          auth.activeGame.id,
          telegramId,
          patch,
        );
        await store.setSessionState(telegramId, { type: 'idle' });

        if (auth.activeGame.status === 'drawn') {
          const santa = await store.getSantaForRecipient(auth.me.id);
          if (santa) {
            try {
              await bot.api.sendMessage(
                santa.telegramId,
                `📝 <i>(${escapeHtml(auth.activeGame.title)})</i>\nТвой подопечный (<b>${escapeHtml(auth.me.displayName)}</b>) обновил ${state.type === 'edit_wishlist' ? 'вишлист' : 'пожелания по доставке/ограничениям'}! Проверь в /menu.`,
                { parse_mode: 'HTML' },
              );
            } catch {
              // Ignore
            }
          }
        }

        await ctx.reply('✅ Анкета сохранена!');
        await renderHome(ctx, telegramId, auth.activeGame.id);
        return;
      }

      case 'msg_to_recipient': {
        if (!auth.me || !auth.me.recipientId) {
          await store.setSessionState(telegramId, { type: 'idle' });
          return;
        }
        const recipient = await store.getParticipantById(auth.me.recipientId);
        if (!recipient) {
          await store.setSessionState(telegramId, { type: 'idle' });
          await ctx.reply('Подопечный не найден.');
          return;
        }

        try {
          await bot.api.sendMessage(
            recipient.telegramId,
            `🎅 <b>Сообщение от твоего Тайного Санты</b> <i>(${escapeHtml(auth.activeGame.title)})</i>:\n\n${escapeHtml(text)}`,
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard().text(
                '↩️ Ответить Санте',
                `chat:to_santa:${auth.activeGame.id}`,
              ),
            },
          );
          await store.setSessionState(telegramId, { type: 'idle' });
          await ctx.reply('✅ Сообщение отправлено подопечному анонимно!');
        } catch {
          await store.setSessionState(telegramId, { type: 'idle' });
          await ctx.reply(
            '❌ Не удалось доставить сообщение (возможно, получатель заблокировал бота).',
          );
        }
        await renderHome(ctx, telegramId, auth.activeGame.id);
        return;
      }

      case 'msg_to_santa': {
        if (!auth.me) {
          await store.setSessionState(telegramId, { type: 'idle' });
          return;
        }
        const santa = await store.getSantaForRecipient(auth.me.id);
        if (!santa) {
          await store.setSessionState(telegramId, { type: 'idle' });
          await ctx.reply('Твой Санта не найден.');
          return;
        }

        try {
          await bot.api.sendMessage(
            santa.telegramId,
            `🎁 <b>Ответ от твоего подопечного (${escapeHtml(auth.me.displayName)})</b> <i>(${escapeHtml(auth.activeGame.title)})</i>:\n\n${escapeHtml(text)}`,
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard().text(
                '↩️ Ответить подопечному',
                `chat:to_recipient:${auth.activeGame.id}`,
              ),
            },
          );
          await store.setSessionState(telegramId, { type: 'idle' });
          await ctx.reply('✅ Ответ отправлен твоему Тайному Санте!');
        } catch {
          await store.setSessionState(telegramId, { type: 'idle' });
          await ctx.reply(
            '❌ Не удалось доставить сообщение (возможно, твой Санта остановил бота).',
          );
        }
        await renderHome(ctx, telegramId, auth.activeGame.id);
        return;
      }

      case 'admin_edit_title':
      case 'admin_edit_budget':
      case 'admin_edit_date': {
        if (!auth.isAdmin) {
          await store.setSessionState(telegramId, { type: 'idle' });
          return;
        }
        if (text.length === 0 || text.length > 100) {
          await ctx.reply('Текст должен быть от 1 до 100 символов:');
          return;
        }

        let updatedGame: GameSettings;
        if (state.type === 'admin_edit_title') {
          updatedGame = await store.updateGameSettings(auth.activeGame.id, {
            title: text,
          });
        } else if (state.type === 'admin_edit_budget') {
          updatedGame = await store.updateGameSettings(auth.activeGame.id, {
            budget: text,
          });
        } else {
          updatedGame = await store.updateGameSettings(auth.activeGame.id, {
            eventDate: text,
          });
        }

        await store.setSessionState(telegramId, { type: 'idle' });
        await ctx.reply('✅ Настройка сохранена!');
        await safeEditOrSend(
          ctx,
          `📝 <b>Настройки игры</b>\n\n${formatGameHeader(updatedGame)}`,
          buildAdminSettingsKeyboard(),
        );
        return;
      }
    }
  });

  // Fallback for non-text messages while waiting for text input
  bot.on('message', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const telegramId = getTelegramId(ctx);
    if (!telegramId) return;
    const session = await store.getSession(telegramId);
    if (session.state.type !== 'idle') {
      await ctx.reply(
        'Пожалуйста, отправь обычное текстовое сообщение (или нажми ❌ Отмена).',
        { reply_markup: buildCancelKeyboard('menu:home') },
      );
    }
  });
}
