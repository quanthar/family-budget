import assert from 'node:assert/strict';
import test from 'node:test';
import { SqliteStore } from './sqlite.js';

test('SqliteStore lifecycle: participants, exclusions, draw, reset, sessions', async () => {
  const store = new SqliteStore(':memory:');
  await store.init('INVITE123');

  try {
    const game = await store.getGame();
    assert.equal(game.inviteCode, 'INVITE123');
    assert.equal(game.status, 'registration');
    assert.equal(game.adminTelegramId, null);
    assert.ok(game.adminClaimCode?.startsWith('admin_'));

    const claimed = await store.claimAdmin('9999');
    assert.equal(claimed.adminTelegramId, '9999');
    assert.equal(claimed.adminClaimCode, null);

    const a = await store.upsertParticipant({
      telegramId: '1001',
      username: 'alice',
      displayName: 'Алиса',
    });
    const b = await store.upsertParticipant({
      telegramId: '1002',
      username: 'bob',
      displayName: 'Боб',
    });
    const c = await store.upsertParticipant({
      telegramId: '1003',
      username: null,
      displayName: 'Вова',
    });

    assert.equal(a.created, true);
    assert.equal((await store.listParticipants()).length, 3);

    await store.updateParticipantProfile('1001', {
      wishlist: 'Термокружка',
      antiWishlist: 'Без сладкого',
    });
    const alice = await store.getParticipantByTelegramId('1001');
    assert.equal(alice?.wishlist, 'Термокружка');
    assert.equal(alice?.antiWishlist, 'Без сладкого');

    // Exclusions
    await store.addExclusion(a.participant.id, b.participant.id, true);
    let exclusions = await store.listExclusions();
    assert.equal(exclusions.length, 2);

    await store.removeExclusion(exclusions[0].id);
    exclusions = await store.listExclusions();
    assert.equal(exclusions.length, 1);

    // Apply draw
    await store.applyDraw([
      { giverId: a.participant.id, receiverId: c.participant.id },
      { giverId: c.participant.id, receiverId: b.participant.id },
      { giverId: b.participant.id, receiverId: a.participant.id },
    ]);

    const drawnGame = await store.getGame();
    assert.equal(drawnGame.status, 'drawn');

    const santaForBob = await store.getSantaForRecipient(b.participant.id);
    assert.equal(santaForBob?.id, c.participant.id);

    await store.setGiftReady('1001', true);
    assert.equal((await store.getParticipantByTelegramId('1001'))?.giftReady, true);

    // Reset draw
    await store.resetDraw();
    const resetGame = await store.getGame();
    assert.equal(resetGame.status, 'registration');
    assert.equal((await store.getParticipantByTelegramId('1001'))?.recipientId, null);
    assert.equal((await store.getParticipantByTelegramId('1001'))?.giftReady, false);

    // Remove participant cascades exclusions
    await store.addExclusion(a.participant.id, c.participant.id, true);
    await store.removeParticipant(c.participant.id);
    assert.equal((await store.listParticipants()).length, 2);
    assert.equal((await store.listExclusions()).length, 1); // only b->a left

    // Session
    await store.setSession('1001', { type: 'edit_wishlist' });
    assert.deepEqual(await store.getSession('1001'), { type: 'edit_wishlist' });
  } finally {
    await store.close();
  }
});
