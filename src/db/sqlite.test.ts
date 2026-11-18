import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { SqliteStore } from './sqlite.js';

test('SqliteStore multi-room lifecycle: games, isolation, draw, reset, sessions', async () => {
  const store = new SqliteStore(':memory:');
  await store.init('INVITE123');

  try {
    const game1 = await store.getGame(1);
    assert.ok(game1);
    assert.equal(game1.inviteCode, 'INVITE123');
    assert.equal(game1.status, 'registration');
    assert.equal(game1.adminTelegramId, null);
    assert.ok(game1.adminClaimCode?.startsWith('admin_'));

    const claimed = await store.claimAdmin(1, '9999');
    assert.equal(claimed.adminTelegramId, '9999');
    assert.equal(claimed.adminClaimCode, null);

    const a = await store.upsertParticipant(1, {
      telegramId: '1001',
      username: 'alice',
      displayName: 'Алиса',
    });
    const b = await store.upsertParticipant(1, {
      telegramId: '1002',
      username: 'bob',
      displayName: 'Боб',
    });
    const c = await store.upsertParticipant(1, {
      telegramId: '1003',
      username: null,
      displayName: 'Вова',
    });

    assert.equal(a.created, true);
    assert.equal((await store.listParticipants(1)).length, 3);

    await store.updateParticipantProfile(1, '1001', {
      wishlist: 'Термокружка',
      antiWishlist: 'Без сладкого',
    });
    const alice = await store.getParticipantByTelegramId(1, '1001');
    assert.equal(alice?.wishlist, 'Термокружка');
    assert.equal(alice?.antiWishlist, 'Без сладкого');

    // Exclusions in game 1
    await store.addExclusion(1, a.participant.id, b.participant.id, true);
    let exclusions = await store.listExclusions(1);
    assert.equal(exclusions.length, 2);

    await store.removeExclusion(1, exclusions[0].id);
    exclusions = await store.listExclusions(1);
    assert.equal(exclusions.length, 1);

    // Apply draw in game 1
    await store.applyDraw(1, [
      { giverId: a.participant.id, receiverId: c.participant.id },
      { giverId: c.participant.id, receiverId: b.participant.id },
      { giverId: b.participant.id, receiverId: a.participant.id },
    ]);

    const drawnGame = await store.getGame(1);
    assert.equal(drawnGame?.status, 'drawn');

    const santaForBob = await store.getSantaForRecipient(b.participant.id);
    assert.equal(santaForBob?.id, c.participant.id);

    await store.setGiftReady(1, '1001', true);
    assert.equal(
      (await store.getParticipantByTelegramId(1, '1001'))?.giftReady,
      true,
    );

    // Friend 1001 creates Game 2 for relatives while Game 1 stays drawn!
    const game2 = await store.createGame({
      title: 'Семья Алисы',
      adminTelegramId: '1001',
      inviteCode: 'FAMILY2',
    });
    assert.equal(game2.id, 2);
    assert.equal(game2.status, 'registration');

    // Relative 2001 joins ONLY Game 2
    await store.upsertParticipant(game2.id, {
      telegramId: '2001',
      username: 'mom',
      displayName: 'Мама',
    });
    await store.upsertParticipant(game2.id, {
      telegramId: '1001',
      username: 'alice',
      displayName: 'Алиса (семья)',
    });

    const relativeGames = await store.listGamesForUser('2001');
    assert.deepEqual(
      relativeGames.map((g) => g.id),
      [2],
    );
    const aliceGames = await store.listGamesForUser('1001');
    assert.deepEqual(
      aliceGames.map((g) => g.id),
      [1, 2],
    );
    assert.equal(await store.isParticipantInGame(1, '2001'), false);
    assert.equal(await store.isParticipantInGame(2, '2001'), true);

    // Game 1 is still intact and drawn!
    const game1StillDrawn = await store.getGame(1);
    assert.equal(game1StillDrawn?.status, 'drawn');
    assert.equal((await store.listParticipants(1)).length, 3);

    // Reset draw in game 1 only
    await store.resetDraw(1);
    const resetGame = await store.getGame(1);
    assert.equal(resetGame?.status, 'registration');
    assert.equal(
      (await store.getParticipantByTelegramId(1, '1001'))?.recipientId,
      null,
    );
    assert.equal(
      (await store.getParticipantByTelegramId(1, '1001'))?.giftReady,
      false,
    );

    // Remove participant in game 1 cascades exclusions
    await store.addExclusion(1, a.participant.id, c.participant.id, true);
    await store.removeParticipant(1, c.participant.id);
    assert.equal((await store.listParticipants(1)).length, 2);
    assert.equal((await store.listExclusions(1)).length, 1);

    // Session active game + state
    await store.setActiveGame('1001', 2);
    await store.setSessionState('1001', { type: 'edit_wishlist', gameId: 2, append: true });
    const session = await store.getSession('1001');
    assert.equal(session.activeGameId, 2);
    assert.deepEqual(session.state, {
      type: 'edit_wishlist',
      gameId: 2,
      append: true,
    });
  } finally {
    await store.close();
  }
});

test('SqliteStore v1 -> v2 migration preserves existing drawn game and allows second room', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'santa-mig-'));
  const dbFile = path.join(tmpDir, 'legacy.db');

  // Seed legacy v1 schema directly
  const legacyDb = new DatabaseSync(dbFile);
  legacyDb.exec(`
    CREATE TABLE santa_games (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      title TEXT NOT NULL,
      budget TEXT,
      event_date TEXT,
      invite_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'registration',
      drawn_at TEXT,
      admin_telegram_id TEXT,
      admin_claim_code TEXT
    );

    CREATE TABLE santa_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL UNIQUE,
      username TEXT,
      display_name TEXT NOT NULL,
      wishlist TEXT,
      anti_wishlist TEXT,
      recipient_id INTEGER,
      gift_ready INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE santa_exclusions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      giver_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      UNIQUE (giver_id, receiver_id),
      FOREIGN KEY (giver_id) REFERENCES santa_participants(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES santa_participants(id) ON DELETE CASCADE
    );

    CREATE TABLE santa_sessions (
      telegram_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO santa_games VALUES (1, 'Наша игра', '2000 ₽', '31 дек', 'OLD_CODE', 'drawn', '2026-11-17T10:00:00Z', '777', NULL);
    INSERT INTO santa_participants (id, telegram_id, username, display_name, wishlist, anti_wishlist, recipient_id, gift_ready, joined_at, updated_at)
      VALUES
        (1, '777', 'admin', 'Админ', 'Книга', NULL, 2, 1, '2026-11-17T09:00:00Z', '2026-11-17T09:00:00Z'),
        (2, '888', 'friend', 'Друг', 'Кофе', 'Без орехов', 1, 0, '2026-11-17T09:05:00Z', '2026-11-17T09:05:00Z');
    INSERT INTO santa_exclusions (giver_id, receiver_id) VALUES (1, 2);
    INSERT INTO santa_sessions VALUES ('777', '{"type":"idle"}', '2026-11-17T10:00:00Z');
  `);
  legacyDb.close();

  const store = new SqliteStore(dbFile);
  try {
    await store.init('IGNORED');

    const game1 = await store.getGame(1);
    assert.ok(game1);
    assert.equal(game1.title, 'Наша игра');
    assert.equal(game1.status, 'drawn');
    assert.equal(game1.adminTelegramId, '777');
    assert.equal(game1.inviteCode, 'OLD_CODE');

    const p1 = await store.getParticipantByTelegramId(1, '777');
    const p2 = await store.getParticipantByTelegramId(1, '888');
    assert.equal(p1?.recipientId, 2);
    assert.equal(p1?.giftReady, true);
    assert.equal(p2?.recipientId, 1);
    assert.equal(p2?.wishlist, 'Кофе');
    assert.equal((await store.listExclusions(1)).length, 1);

    const oldSession = await store.getSession('777');
    assert.equal(oldSession.activeGameId, 1);

    // Friend 888 creates a second game without touching game 1
    const game2 = await store.createGame({
      title: 'Родственники Друга',
      adminTelegramId: '888',
      inviteCode: 'REL_CODE',
    });
    assert.equal(game2.id, 2);

    // Same telegram_id '888' can now also be participant in game 2
    await store.upsertParticipant(2, {
      telegramId: '888',
      username: 'friend',
      displayName: 'Друг в семье',
    });
    await store.upsertParticipant(2, {
      telegramId: '999',
      username: 'rel',
      displayName: 'Тётя',
    });

    assert.deepEqual(
      (await store.listGamesForUser('999')).map((g) => g.id),
      [2],
    );
    assert.deepEqual(
      (await store.listGamesForUser('888')).map((g) => g.id),
      [1, 2],
    );

    // Verify game 1 remained completely untouched
    const game1After = await store.getGame(1);
    assert.equal(game1After?.status, 'drawn');
    assert.equal((await store.listParticipants(1)).length, 2);
  } finally {
    await store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
