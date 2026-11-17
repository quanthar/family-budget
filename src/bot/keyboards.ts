import { InlineKeyboard } from 'grammy';
import type { GameStatus, Participant } from '../types.js';
import type { GroupedExclusion } from './formatters.js';

export function buildCancelKeyboard(backCallback = 'menu:home'): InlineKeyboard {
  return new InlineKeyboard().text('❌ Отмена', backCallback);
}

export function buildHomeKeyboard(
  status: GameStatus,
  isAdmin: boolean,
  giftReady: boolean,
): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (status === 'registration') {
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
        giftReady ? '↩️ Снять отметку «подарок готов»' : '✅ Подарок готов / отправлен',
        'gift:toggle',
      )
      .row()
      .text('📝 Моя анкета', 'profile:view')
      .text('🔄 Обновить', 'menu:home');
  }

  if (isAdmin) {
    kb.row().text('⚙️ Админ-панель', 'admin:home');
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

export function buildAdminKeyboard(
  status: GameStatus,
  adminIsParticipant: boolean,
): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text('🔗 Инвайт-ссылка', 'admin:invite')
    .text('📝 Настройки игры', 'admin:settings')
    .row()
    .text('👥 Участники (удалить)', 'admin:participants')
    .text('🚫 Пары-исключения', 'admin:exclusions')
    .row();

  if (status === 'registration') {
    kb.text('🎲 Провести жеребьёвку', 'admin:draw_confirm').row();
  } else {
    kb.text('🔄 Сбросить жеребьёвку (удалить пары)', 'admin:reset_confirm').row();
  }

  kb.text('📢 Напомнить участникам', 'admin:nudge').row();

  if (!adminIsParticipant) {
    kb.text('🎄 Присоединиться к игре', 'admin:join_self').row();
  } else {
    kb.text('🏠 В меню участника', 'menu:home');
  }

  return kb;
}

export function buildAdminInviteKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 Сменить код ссылки', 'admin:invite:regen')
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
