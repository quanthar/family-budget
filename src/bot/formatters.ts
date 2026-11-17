import type { Exclusion, GameSettings, Participant } from '../types.js';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatParticipantLabel(p: Participant): string {
  const name = escapeHtml(p.displayName);
  return p.username ? `${name} (@${escapeHtml(p.username)})` : name;
}

export function formatGameHeader(game: GameSettings): string {
  const lines: string[] = [`<b>${escapeHtml(game.title)}</b>`];
  if (game.budget) {
    lines.push(`💰 Бюджет: <b>${escapeHtml(game.budget)}</b>`);
  }
  if (game.eventDate) {
    lines.push(`📅 Дата обмена: <b>${escapeHtml(game.eventDate)}</b>`);
  }
  lines.push(
    game.status === 'registration'
      ? '📌 Статус: <b>Идёт регистрация</b>'
      : '🎉 Статус: <b>Жеребьёвка проведена!</b>',
  );
  return lines.join('\n');
}

export function formatMyProfileBlock(p: Participant): string {
  const wishlist = p.wishlist
    ? escapeHtml(p.wishlist)
    : '<i>пока не заполнено</i>';
  const anti = p.antiWishlist
    ? escapeHtml(p.antiWishlist)
    : '<i>не указано</i>';

  return [
    '<b>Твоя анкета:</b>',
    `👤 Имя: <b>${escapeHtml(p.displayName)}</b>`,
    `🎁 Вишлист: ${wishlist}`,
    `🚫 Что не дарить / доставка: ${anti}`,
  ].join('\n');
}

export function formatRecipientBlock(
  me: Participant,
  recipient: Participant,
): string {
  const wishlist = recipient.wishlist
    ? escapeHtml(recipient.wishlist)
    : '<i>участник пока не заполнил вишлист (можешь спросить анонимно!)</i>';
  const anti = recipient.antiWishlist
    ? escapeHtml(recipient.antiWishlist)
    : '<i>не указано</i>';

  return [
    `🎯 <b>Твой подопечный:</b> ${formatParticipantLabel(recipient)}`,
    `🎁 <b>Вишлист:</b>\n${wishlist}`,
    `🚫 <b>Что не дарить / доставка:</b>\n${anti}`,
    '',
    me.giftReady
      ? '✅ Статус подарка: <b>Готов / отправлен</b>'
      : '⏳ Статус подарка: <b>Ещё в процессе</b>',
  ].join('\n');
}

export function formatHomeMessage(
  game: GameSettings,
  me: Participant,
  recipient: Participant | null,
  participantCount: number,
  wishlistCount: number,
): string {
  const parts = [formatGameHeader(game), ''];

  if (game.status === 'registration') {
    parts.push(
      `👥 Участников: <b>${participantCount}</b> (заполнили вишлист: ${wishlistCount}/${participantCount})`,
      '',
      formatMyProfileBlock(me),
      '',
      'Заполни имя и вишлист до начала жеребьёвки, чтобы твоему Санте было проще выбрать подарок!',
    );
  } else if (recipient) {
    parts.push(formatRecipientBlock(me, recipient));
  } else {
    parts.push(
      '⚠️ Жеребьёвка уже была проведена до твоего входа или пара была сброшена. Обратись к организатору.',
    );
  }

  return parts.join('\n');
}

export interface GroupedExclusion {
  primaryId: number;
  secondaryId?: number;
  giver: Participant;
  receiver: Participant;
  mutual: boolean;
}

export function groupExclusions(
  exclusions: Exclusion[],
  participants: Participant[],
): GroupedExclusion[] {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const pairMap = new Map<string, Exclusion>();
  for (const ex of exclusions) {
    pairMap.set(`${ex.giverId}:${ex.receiverId}`, ex);
  }

  const seen = new Set<number>();
  const result: GroupedExclusion[] = [];

  for (const ex of exclusions) {
    if (seen.has(ex.id)) continue;
    const giver = byId.get(ex.giverId);
    const receiver = byId.get(ex.receiverId);
    if (!giver || !receiver) continue;

    const reverse = pairMap.get(`${ex.receiverId}:${ex.giverId}`);
    if (reverse && !seen.has(reverse.id)) {
      seen.add(ex.id);
      seen.add(reverse.id);
      result.push({
        primaryId: ex.id,
        secondaryId: reverse.id,
        giver,
        receiver,
        mutual: true,
      });
    } else {
      seen.add(ex.id);
      result.push({
        primaryId: ex.id,
        giver,
        receiver,
        mutual: false,
      });
    }
  }

  return result;
}

export function formatAdminDashboard(
  game: GameSettings,
  participants: Participant[],
  exclusionsCount: number,
): string {
  const withWishlist = participants.filter((p) => Boolean(p.wishlist)).length;
  const readyCount = participants.filter((p) => p.giftReady).length;

  const lines = [
    '⚙️ <b>Админ-панель (без спойлеров)</b>',
    '',
    formatGameHeader(game),
    '',
    `👥 Участников: <b>${participants.length}</b>`,
    `📝 Заполнили вишлист: <b>${withWishlist}/${participants.length}</b>`,
    `🚫 Правил-исключений: <b>${exclusionsCount}</b>`,
  ];

  if (game.status === 'drawn') {
    lines.push(
      `🎁 Отметили готовность подарка: <b>${readyCount}/${participants.length}</b>`,
    );
  }

  return lines.join('\n');
}
