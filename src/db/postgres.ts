import crypto from 'node:crypto';
import { Pool } from 'pg';
import type {
  DrawAssignment,
  Exclusion,
  GameSettings,
  GameStatus,
  Participant,
  SessionState,
} from '../types.js';
import type { SantaStore } from './store.js';

interface GameRow {
  id: number;
  title: string;
  budget: string | null;
  event_date: string | null;
  invite_code: string;
  status: string;
  drawn_at: string | null;
  admin_telegram_id: string | null;
  admin_claim_code: string | null;
}

interface ParticipantRow {
  id: number;
  telegram_id: string;
  username: string | null;
  display_name: string;
  wishlist: string | null;
  anti_wishlist: string | null;
  recipient_id: number | null;
  gift_ready: boolean;
  joined_at: string;
  updated_at: string;
}

interface ExclusionRow {
  id: number;
  giver_id: number;
  receiver_id: number;
}

function mapGame(row: GameRow): GameSettings {
  return {
    id: row.id,
    title: row.title,
    budget: row.budget,
    eventDate: row.event_date,
    inviteCode: row.invite_code,
    status: row.status as GameStatus,
    drawnAt: row.drawn_at,
    adminTelegramId: row.admin_telegram_id,
    adminClaimCode: row.admin_claim_code,
  };
}

function mapParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id,
    telegramId: row.telegram_id,
    username: row.username,
    displayName: row.display_name,
    wishlist: row.wishlist,
    antiWishlist: row.anti_wishlist,
    recipientId: row.recipient_id,
    giftReady: Boolean(row.gift_ready),
    joinedAt: row.joined_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresStore implements SantaStore {
  readonly kind = 'postgres' as const;
  private pool: Pool;

  constructor(databaseUrl: string) {
    const needsSsl =
      !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
  }

  async init(defaultInviteCode: string): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS santa_games (
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

      ALTER TABLE santa_games ADD COLUMN IF NOT EXISTS admin_telegram_id TEXT;
      ALTER TABLE santa_games ADD COLUMN IF NOT EXISTS admin_claim_code TEXT;

      CREATE TABLE IF NOT EXISTS santa_participants (
        id SERIAL PRIMARY KEY,
        telegram_id TEXT NOT NULL UNIQUE,
        username TEXT,
        display_name TEXT NOT NULL,
        wishlist TEXT,
        anti_wishlist TEXT,
        recipient_id INTEGER,
        gift_ready BOOLEAN NOT NULL DEFAULT FALSE,
        joined_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS santa_exclusions (
        id SERIAL PRIMARY KEY,
        giver_id INTEGER NOT NULL REFERENCES santa_participants(id) ON DELETE CASCADE,
        receiver_id INTEGER NOT NULL REFERENCES santa_participants(id) ON DELETE CASCADE,
        UNIQUE (giver_id, receiver_id)
      );

      CREATE TABLE IF NOT EXISTS santa_sessions (
        telegram_id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const defaultClaimCode = `admin_${crypto.randomBytes(8).toString('hex')}`;
    await this.pool.query(
      `INSERT INTO santa_games (id, title, budget, event_date, invite_code, status, drawn_at, admin_telegram_id, admin_claim_code)
       VALUES (1, $1, NULL, NULL, $2, 'registration', NULL, NULL, $3)
       ON CONFLICT (id) DO NOTHING`,
      ['Тайный Санта 🎄', defaultInviteCode, defaultClaimCode],
    );
  }

  async claimAdmin(telegramId: string): Promise<GameSettings> {
    await this.pool.query(
      'UPDATE santa_games SET admin_telegram_id = $1, admin_claim_code = NULL WHERE id = 1',
      [telegramId],
    );
    return this.getGame();
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getGame(): Promise<GameSettings> {
    const res = await this.pool.query<GameRow>(
      'SELECT * FROM santa_games WHERE id = 1',
    );
    if (res.rows.length === 0) {
      throw new Error('Game settings row missing');
    }
    return mapGame(res.rows[0]);
  }

  async updateGameSettings(
    patch: Partial<
      Pick<GameSettings, 'title' | 'budget' | 'eventDate' | 'inviteCode'>
    >,
  ): Promise<GameSettings> {
    const current = await this.getGame();
    const nextTitle = patch.title !== undefined ? patch.title : current.title;
    const nextBudget = patch.budget !== undefined ? patch.budget : current.budget;
    const nextDate =
      patch.eventDate !== undefined ? patch.eventDate : current.eventDate;
    const nextInvite =
      patch.inviteCode !== undefined ? patch.inviteCode : current.inviteCode;

    await this.pool.query(
      `UPDATE santa_games
       SET title = $1, budget = $2, event_date = $3, invite_code = $4
       WHERE id = 1`,
      [nextTitle, nextBudget, nextDate, nextInvite],
    );
    return this.getGame();
  }

  async listParticipants(): Promise<Participant[]> {
    const res = await this.pool.query<ParticipantRow>(
      'SELECT * FROM santa_participants ORDER BY id ASC',
    );
    return res.rows.map(mapParticipant);
  }

  async getParticipantById(id: number): Promise<Participant | null> {
    const res = await this.pool.query<ParticipantRow>(
      'SELECT * FROM santa_participants WHERE id = $1',
      [id],
    );
    return res.rows[0] ? mapParticipant(res.rows[0]) : null;
  }

  async getParticipantByTelegramId(
    telegramId: string,
  ): Promise<Participant | null> {
    const res = await this.pool.query<ParticipantRow>(
      'SELECT * FROM santa_participants WHERE telegram_id = $1',
      [telegramId],
    );
    return res.rows[0] ? mapParticipant(res.rows[0]) : null;
  }

  async getSantaForRecipient(recipientId: number): Promise<Participant | null> {
    const res = await this.pool.query<ParticipantRow>(
      'SELECT * FROM santa_participants WHERE recipient_id = $1',
      [recipientId],
    );
    return res.rows[0] ? mapParticipant(res.rows[0]) : null;
  }

  async upsertParticipant(input: {
    telegramId: string;
    username: string | null;
    displayName: string;
  }): Promise<{ participant: Participant; created: boolean }> {
    const existing = await this.getParticipantByTelegramId(input.telegramId);
    const now = new Date().toISOString();

    if (existing) {
      await this.pool.query(
        'UPDATE santa_participants SET username = $1, updated_at = $2 WHERE telegram_id = $3',
        [input.username, now, input.telegramId],
      );
      const updated = (await this.getParticipantByTelegramId(input.telegramId))!;
      return { participant: updated, created: false };
    }

    await this.pool.query(
      `INSERT INTO santa_participants (telegram_id, username, display_name, joined_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.telegramId, input.username, input.displayName, now, now],
    );
    const created = (await this.getParticipantByTelegramId(input.telegramId))!;
    return { participant: created, created: true };
  }

  async updateParticipantProfile(
    telegramId: string,
    patch: Partial<
      Pick<Participant, 'displayName' | 'wishlist' | 'antiWishlist' | 'username'>
    >,
  ): Promise<Participant | null> {
    const current = await this.getParticipantByTelegramId(telegramId);
    if (!current) return null;

    const now = new Date().toISOString();
    await this.pool.query(
      `UPDATE santa_participants
       SET display_name = $1, wishlist = $2, anti_wishlist = $3, username = $4, updated_at = $5
       WHERE telegram_id = $6`,
      [
        patch.displayName !== undefined
          ? patch.displayName
          : current.displayName,
        patch.wishlist !== undefined ? patch.wishlist : current.wishlist,
        patch.antiWishlist !== undefined
          ? patch.antiWishlist
          : current.antiWishlist,
        patch.username !== undefined ? patch.username : current.username,
        now,
        telegramId,
      ],
    );
    return this.getParticipantByTelegramId(telegramId);
  }

  async setGiftReady(
    telegramId: string,
    ready: boolean,
  ): Promise<Participant | null> {
    const now = new Date().toISOString();
    await this.pool.query(
      'UPDATE santa_participants SET gift_ready = $1, updated_at = $2 WHERE telegram_id = $3',
      [ready, now, telegramId],
    );
    return this.getParticipantByTelegramId(telegramId);
  }

  async removeParticipant(participantId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE santa_participants SET recipient_id = NULL WHERE recipient_id = $1',
        [participantId],
      );
      await client.query('DELETE FROM santa_participants WHERE id = $1', [
        participantId,
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listExclusions(): Promise<Exclusion[]> {
    const res = await this.pool.query<ExclusionRow>(
      'SELECT id, giver_id, receiver_id FROM santa_exclusions ORDER BY id ASC',
    );
    return res.rows.map((r) => ({
      id: r.id,
      giverId: r.giver_id,
      receiverId: r.receiver_id,
    }));
  }

  async addExclusion(
    giverId: number,
    receiverId: number,
    mutual: boolean,
  ): Promise<void> {
    if (giverId === receiverId) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO santa_exclusions (giver_id, receiver_id)
         VALUES ($1, $2) ON CONFLICT (giver_id, receiver_id) DO NOTHING`,
        [giverId, receiverId],
      );
      if (mutual) {
        await client.query(
          `INSERT INTO santa_exclusions (giver_id, receiver_id)
           VALUES ($1, $2) ON CONFLICT (giver_id, receiver_id) DO NOTHING`,
          [receiverId, giverId],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async removeExclusion(exclusionId: number): Promise<void> {
    await this.pool.query('DELETE FROM santa_exclusions WHERE id = $1', [
      exclusionId,
    ]);
  }

  async applyDraw(assignments: DrawAssignment[]): Promise<GameSettings> {
    const now = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const a of assignments) {
        await client.query(
          'UPDATE santa_participants SET recipient_id = $1, gift_ready = FALSE, updated_at = $2 WHERE id = $3',
          [a.receiverId, now, a.giverId],
        );
      }
      await client.query(
        `UPDATE santa_games SET status = 'drawn', drawn_at = $1 WHERE id = 1`,
        [now],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.getGame();
  }

  async resetDraw(): Promise<GameSettings> {
    const now = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE santa_participants SET recipient_id = NULL, gift_ready = FALSE, updated_at = $1',
        [now],
      );
      await client.query(
        `UPDATE santa_games SET status = 'registration', drawn_at = NULL WHERE id = 1`,
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.getGame();
  }

  async getSession(telegramId: string): Promise<SessionState> {
    const res = await this.pool.query<{ state_json: string }>(
      'SELECT state_json FROM santa_sessions WHERE telegram_id = $1',
      [telegramId],
    );
    if (res.rows.length === 0) return { type: 'idle' };
    try {
      return JSON.parse(res.rows[0].state_json) as SessionState;
    } catch {
      return { type: 'idle' };
    }
  }

  async setSession(telegramId: string, state: SessionState): Promise<void> {
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO santa_sessions (telegram_id, state_json, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id) DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = EXCLUDED.updated_at`,
      [telegramId, JSON.stringify(state), now],
    );
  }
}
