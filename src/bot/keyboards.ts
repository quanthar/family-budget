import { InlineKeyboard } from 'grammy';
import type { GameSettings, GameStatus, Participant } from '../types.js';
import type { GroupedExclusion } from './formatters.js';

export function buildCancelKeyboard(backCallback = 'menu:home'): InlineKeyboard {
  return new InlineKeyboard().text('❌ Отмена', backCallback);
}

export function buildWishlistPromptKeyboard(
  hasExistingWishlist: boolean,
  backCallback = 'menu:home',
): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (hasExistingWishlist) {
    kb.text('➕ Дописать в конец (не удаляя старое)', 'profile:wishlist_append').row();
  }
  kb.text('❌ Отмена', backCallback);
  return kb;
}

export function buildHomeKeyboard(opts: {
  status: GameStatus;
  isAdmin: boolean;
  giftReady: boolean;
  gamesCount: number;
  canCreateGame: boolean;
}): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (opts.status === 'registration') {
    kb.text('✏️ Изменить имя', 'profile:name')
      .text('🎁 Вишлист', 'profile:wishlist')
      .row()
      .text('🚫 Что не дарить / доставка', 'profile:anti')
      .row()
      .text('👥 Кто уже в игре', 'game:participants')
      .text('🔄 Обновить', 'menu:home');
  } else {
    kb.text('✉️ Написать подопечному', 'chat:to_recipient')
      .row()
      .text('🎅 Написать моему Санте', 'chat:to_santa')
      .row()
      .text(
        opts.giftReady
          ? '↩️ Снять отметку «подарок готов»'
          : '✅ Подарок готов / отправлен',
        'gift:toggle',
      )
      .row()
      .text('📝 Моя анкета', 'profile:view')
      .text('🔄 Обновить', 'menu:home');
  }

  if (opts.isAdmin) {
    kb.row().text('⚙️ Админ-панель', 'admin:home');
  }

  if (opts.gamesCount > 1 || opts.canCreateGame) {
    kb.row();
    if (opts.gamesCount > 1) {
      kb.text(`🔀 Мои игры (${opts.gamesCount})`, 'games:list');
    }
    if (opts.canCreateGame) {
      kb.text('➕ Создать свою игру', 'games:create');
    }
  }

  return kb;
}

export function buildGamesListKeyboard(opts: {
  games: GameSettings[];
  activeGameId: number | null;
  isAdminOf: (game: GameSettings) => boolean;
  canCreateGame: boolean;
}): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const g of opts.games) {
    const marker = g.id === opts.activeGameId ? '✅ ' : '';
    const role = opts.isAdminOf(g) ? ' 👑' : '';
    kb.text(`${marker}${g.title}${role}`, `games:select:${g.id}`).row();
  }
  if (opts.canCreateGame) {
    kb.text('➕ Создать свою игру', 'games:create').row();
  }
  if (opts.games.length > 0) {
    kb.text('⬅️ В активную игру', 'menu:home');
  }
  return kb;
}

export function buildProfileViewKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✏️ Изменить имя', 'profile:name')
    .text('🎁 Изменить вишлист', 'profile:wishlist')
    .row()
    .text('🚫 Что не дарить / доставка', 'profile:anti')
    .row()
    .text('⬅️ В главное меню', 'menu:home');
}

export function buildAdminKeyboard(opts: {
  status: GameStatus;
  adminIsParticipant: boolean;
  isSuperAdmin: boolean;
  gamesCount: number;
  canCreateGame: boolean;
}): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text('🔗 Инвайт-ссылка', 'admin:invite')
    .text('📝 Настройки игры', 'admin:settings')
    .row()
    .text('👥 Участники (удалить)', 'admin:participants')
    .text('🚫 Пары-исключения', 'admin:exclusions')
    .row();

  if (opts.status === 'registration') {
    kb.text('🎲 Провести жеребьёвку', 'admin:draw_confirm').row();
  } else {
    kb.text('🔄 Сбросить жеребьёвку (удалить пары)', 'admin:reset_confirm').row();
  }

  kb.text('📢 Напомнить участникам', 'admin:nudge').row();

  if (opts.isSuperAdmin) {
    kb.text('🎫 Ссылка для создания игры (друзьям)', 'admin:host_invite').row();
  }

  if (!opts.adminIsParticipant) {
    kb.text('🎄 Присоединиться к игре', 'admin:join_self').row();
  } else {
    kb.text('🏠 В меню участника', 'menu:home').row();
  }

  if (opts.gamesCount > 1 || opts.canCreateGame) {
    if (opts.gamesCount > 1) {
      kb.text(`🔀 Мои игры (${opts.gamesCount})`, 'games:list');
    }
    if (opts.canCreateGame) {
      kb.text('➕ Создать игру', 'games:create');
    }
  }

  return kb;
}

export function buildAdminInviteKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 Сменить код ссылки', 'admin:invite:regen')
    .row()
    .text('⬅️ Назад в админку', 'admin:home');
}

export function buildAdminHostInviteKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 Сменить ссылку-пропуск', 'admin:host_invite:regen')
    .row()
    .text('⬅️ Назад в админку', 'admin:home');
}

export function buildAdminSettingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✏️ Название игры', 'admin:set_title')
    .row()
    .text('💰 Задать бюджет', 'admin:set_budget')
    .text('🗑 Убрать бюджет', 'admin:clear_budget')
    .row()
    .text('📅 Задать дату', 'admin:set_date')
    .text('🗑 Убрать дату', 'admin:clear_date')
    .row()
    .text('⬅️ Назад в админку', 'admin:home');
}

export function buildAdminParticipantsKeyboard(
  participants: Participant[],
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of participants) {
    kb.text(`❌ Удалить: ${p.displayName}`, `admin:del_user_ask:${p.id}`).row();
  }
  kb.text('⬅️ Назад в админку', 'admin:home');
  return kb;
}

export function buildAdminDeleteParticipantConfirmKeyboard(
  participantId: number,
): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Да, удалить участника', `admin:del_user_do:${participantId}`)
    .row()
    .text('❌ Отмена', 'admin:participants');
}

export function buildAdminExclusionsKeyboard(
  grouped: GroupedExclusion[],
): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text('➕ Добавить пару-исключение', 'admin:ex_add').row();

  for (const item of grouped) {
    const arrow = item.mutual ? '↔' : '→';
    const idsParam = item.secondaryId
      ? `${item.primaryId}_${item.secondaryId}`
      : `${item.primaryId}`;
    kb.text(
      `🗑 ${item.giver.displayName} ${arrow} ${item.receiver.displayName}`,
      `admin:ex_del:${idsParam}`,
    ).row();
  }

  kb.text('⬅️ Назад в админку', 'admin:home');
  return kb;
}

export function buildPickGiverKeyboard(
  participants: Participant[],
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of participants) {
    kb.text(p.displayName, `admin:ex_giver:${p.id}`).row();
  }
  kb.text('❌ Отмена', 'admin:exclusions');
  return kb;
}

export function buildPickReceiverKeyboard(
  giverId: number,
  participants: Participant[],
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of participants) {
    if (p.id === giverId) continue;
    kb.text(p.displayName, `admin:ex_recv:${giverId}:${p.id}`).row();
  }
  kb.text('⬅️ Выбрать другого', 'admin:ex_add');
  return kb;
}

export function buildPickExclusionDirectionKeyboard(
  giverId: number,
  receiverId: number,
  giverName: string,
  receiverName: string,
): InlineKeyboard {
  return new InlineKeyboard()
    .text(
      `↔ Взаимно (${giverName} ↔ ${receiverName})`,
      `admin:ex_save:${giverId}:${receiverId}:1`,
    )
    .row()
    .text(
      `→ Только ${giverName} не дарит ${receiverName}`,
      `admin:ex_save:${giverId}:${receiverId}:0`,
    )
    .row()
    .text('❌ Отмена', 'admin:exclusions');
}

export function buildConfirmDrawKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🎲 Да, запустить жеребьёвку!', 'admin:draw_run')
    .row()
    .text('❌ Отмена', 'admin:home');
}

export function buildConfirmResetKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('⚠️ Да, удалить все пары и сбросить', 'admin:reset_run')
    .row()
    .text('❌ Отмена', 'admin:home');
}
