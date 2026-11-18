import crypto from 'node:crypto';
import { Pool } from 'pg';
import type {
  DrawAssignment,
  Exclusion,
  GameSettings,
  GameStatus,
  Participant,
  SessionState,
  UserSession,
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
  created_at: string;
}

interface ParticipantRow {
  id: number;
  game_id: number;
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
  game_id: number;
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
    createdAt: row.created_at,
  };
}

function mapParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id,
    gameId: row.game_id,
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
    const now = new Date().toISOString();

    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS secret_santa;

      CREATE TABLE IF NOT EXISTS secret_santa.santa_games (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        budget TEXT,
        event_date TEXT,
        invite_code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'registration',
        drawn_at TEXT,
        admin_telegram_id TEXT,
        admin_claim_code TEXT,
        created_at TEXT NOT NULL DEFAULT '${now}'
      );

      CREATE TABLE IF NOT EXISTS secret_santa.santa_participants (
        id SERIAL PRIMARY KEY,
        game_id INTEGER NOT NULL DEFAULT 1 REFERENCES secret_santa.santa_games(id) ON DELETE CASCADE,
        telegram_id TEXT NOT NULL,
        username TEXT,
        display_name TEXT NOT NULL,
        wishlist TEXT,
        anti_wishlist TEXT,
        recipient_id INTEGER,
        gift_ready BOOLEAN NOT NULL DEFAULT FALSE,
        joined_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (game_id, telegram_id)
      );

      CREATE TABLE IF NOT EXISTS secret_santa.santa_exclusions (
        id SERIAL PRIMARY KEY,
        game_id INTEGER NOT NULL DEFAULT 1 REFERENCES secret_santa.santa_games(id) ON DELETE CASCADE,
        giver_id INTEGER NOT NULL REFERENCES secret_santa.santa_participants(id) ON DELETE CASCADE,
        receiver_id INTEGER NOT NULL REFERENCES secret_santa.santa_participants(id) ON DELETE CASCADE,
        UNIQUE (giver_id, receiver_id)
      );

      CREATE TABLE IF NOT EXISTS secret_santa.santa_sessions (
        telegram_id TEXT PRIMARY KEY,
        active_game_id INTEGER,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS secret_santa.santa_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS secret_santa.santa_hosts (
        telegram_id TEXT PRIMARY KEY,
        granted_at TEXT NOT NULL
      );
    `);

    // Idempotent v1 -> v2 migration for existing deployments
    await this.pool.query(`
      ALTER TABLE secret_santa.santa_games ADD COLUMN IF NOT EXISTS admin_telegram_id TEXT;
      ALTER TABLE secret_santa.santa_games ADD COLUMN IF NOT EXISTS admin_claim_code TEXT;
      ALTER TABLE secret_santa.santa_games ADD COLUMN IF NOT EXISTS created_at TEXT NOT NULL DEFAULT '${now}';

      DO $$
      DECLARE
        r RECORD;
      BEGIN
        -- Drop CHECK (id = 1) on santa_games if present
        FOR r IN
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'secret_santa.santa_games'::regclass
            AND contype = 'c'
        LOOP
          EXECUTE format('ALTER TABLE secret_santa.santa_games DROP CONSTRAINT IF EXISTS %I', r.conname);
        END LOOP;

        -- Ensure sequence exists for santa_games.id
        CREATE SEQUENCE IF NOT EXISTS secret_santa.santa_games_id_seq;
        ALTER TABLE secret_santa.santa_games ALTER COLUMN id SET DEFAULT nextval('secret_santa.santa_games_id_seq');
        PERFORM setval(
          'secret_santa.santa_games_id_seq',
          GREATEST(COALESCE((SELECT MAX(id) FROM secret_santa.santa_games), 1), 1)
        );
      END $$;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_santa_games_invite_code
        ON secret_santa.santa_games(invite_code);

      ALTER TABLE secret_santa.santa_participants ADD COLUMN IF NOT EXISTS game_id INTEGER NOT NULL DEFAULT 1;

      DO $$
      DECLARE
        r RECORD;
      BEGIN
        -- Drop old global UNIQUE(telegram_id) constraint on santa_participants if present
        FOR r IN
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
          WHERE c.conrelid = 'secret_santa.santa_participants'::regclass
            AND c.contype = 'u'
            AND array_length(c.conkey, 1) = 1
            AND a.attname = 'telegram_id'
        LOOP
          EXECUTE format('ALTER TABLE secret_santa.santa_participants DROP CONSTRAINT IF EXISTS %I', r.conname);
        END LOOP;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'secret_santa.santa_participants'::regclass
            AND conname = 'santa_participants_game_tg_unique'
        ) THEN
          BEGIN
            ALTER TABLE secret_santa.santa_participants
              ADD CONSTRAINT santa_participants_game_tg_unique UNIQUE (game_id, telegram_id);
          EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
          END;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'secret_santa.santa_participants'::regclass
            AND contype = 'f'
            AND conkey = ARRAY[(
              SELECT attnum FROM pg_attribute
              WHERE attrelid = 'secret_santa.santa_participants'::regclass AND attname = 'game_id'
            )]
        ) THEN
          ALTER TABLE secret_santa.santa_participants
            ADD CONSTRAINT santa_participants_game_id_fkey
            FOREIGN KEY (game_id) REFERENCES secret_santa.santa_games(id) ON DELETE CASCADE;
        END IF;
      END $$;

      ALTER TABLE secret_santa.santa_exclusions ADD COLUMN IF NOT EXISTS game_id INTEGER NOT NULL DEFAULT 1;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'secret_santa.santa_exclusions'::regclass
            AND contype = 'f'
            AND conkey = ARRAY[(
              SELECT attnum FROM pg_attribute
              WHERE attrelid = 'secret_santa.santa_exclusions'::regclass AND attname = 'game_id'
            )]
        ) THEN
          ALTER TABLE secret_santa.santa_exclusions
            ADD CONSTRAINT santa_exclusions_game_id_fkey
            FOREIGN KEY (game_id) REFERENCES secret_santa.santa_games(id) ON DELETE CASCADE;
        END IF;
      END $$;

      ALTER TABLE secret_santa.santa_sessions ADD COLUMN IF NOT EXISTS active_game_id INTEGER;
    `);

    const countRes = await this.pool.query<{ cnt: string }>(
      'SELECT COUNT(*)::text as cnt FROM secret_santa.santa_games',
    );
    if (Number(countRes.rows[0]?.cnt ?? 0) === 0) {
      const defaultClaimCode = `admin_${crypto.randomBytes(8).toString('hex')}`;
      await this.pool.query(
        `INSERT INTO secret_santa.santa_games (title, budget, event_date, invite_code, status, drawn_at, admin_telegram_id, admin_claim_code, created_at)
         VALUES ($1, NULL, NULL, $2, 'registration', NULL, NULL, $3, $4)`,
        ['Тайный Санта 🎄', defaultInviteCode, defaultClaimCode, now],
      );
    }

    const hostCode = `host_${crypto.randomBytes(6).toString('base64url')}`;
    await this.pool.query(
      `INSERT INTO secret_santa.santa_meta (key, value) VALUES ('host_invite_code', $1)
       ON CONFLICT (key) DO NOTHING`,
      [hostCode],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getHostInviteCode(): Promise<string> {
    const res = await this.pool.query<{ value: string }>(
      "SELECT value FROM secret_santa.santa_meta WHERE key = 'host_invite_code'",
    );
    if (res.rows[0]) return res.rows[0].value;
    return this.regenerateHostInviteCode();
  }

  async regenerateHostInviteCode(): Promise<string> {
    const code = `host_${crypto.randomBytes(6).toString('base64url')}`;
    await this.pool.query(
      `INSERT INTO secret_santa.santa_meta (key, value) VALUES ('host_invite_code', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [code],
    );
    return code;
  }

  async isHostAllowed(telegramId: string): Promise<boolean> {
    const res = await this.pool.query(
      'SELECT 1 FROM secret_santa.santa_hosts WHERE telegram_id = $1',
      [telegramId],
    );
    return res.rows.length > 0;
  }

  async grantHostAccess(telegramId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO secret_santa.santa_hosts (telegram_id, granted_at)
       VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING`,
      [telegramId, now],
    );
  }

  async countHostedGames(telegramId: string): Promise<number> {
    const res = await this.pool.query<{ cnt: string }>(
      'SELECT COUNT(*)::text as cnt FROM secret_santa.santa_games WHERE admin_telegram_id = $1',
      [telegramId],
    );
    return Number(res.rows[0]?.cnt ?? 0);
  }

  async createGame(input: {
    title: string;
    adminTelegramId: string;
    inviteCode: string;
  }): Promise<GameSettings> {
    const now = new Date().toISOString();
    const res = await this.pool.query<GameRow>(
      `INSERT INTO secret_santa.santa_games (title, budget, event_date, invite_code, status, drawn_at, admin_telegram_id, admin_claim_code, created_at)
       VALUES ($1, NULL, NULL, $2, 'registration', NULL, $3, NULL, $4)
       RETURNING *`,
      [input.title, input.inviteCode, input.adminTelegramId, now],
    );
    return mapGame(res.rows[0]);
  }

  async getGame(gameId: number): Promise<GameSettings | null> {
    const res = await this.pool.query<GameRow>(
      'SELECT * FROM secret_santa.santa_games WHERE id = $1',
      [gameId],
    );
    return res.rows[0] ? mapGame(res.rows[0]) : null;
  }

  async getGameByInviteCode(inviteCode: string): Promise<GameSettings | null> {
    const res = await this.pool.query<GameRow>(
      'SELECT * FROM secret_santa.santa_games WHERE invite_code = $1',
      [inviteCode],
    );
    return res.rows[0] ? mapGame(res.rows[0]) : null;
  }

  async listGamesForUser(telegramId: string): Promise<GameSettings[]> {
    const res = await this.pool.query<GameRow>(
      `SELECT DISTINCT g.*
       FROM secret_santa.santa_games g
       LEFT JOIN secret_santa.santa_participants p ON p.game_id = g.id AND p.telegram_id = $1
       WHERE g.admin_telegram_id = $1 OR p.id IS NOT NULL
       ORDER BY g.id ASC`,
      [telegramId],
    );
    return res.rows.map(mapGame);
  }

  async isParticipantInGame(
    gameId: number,
    telegramId: string,
  ): Promise<boolean> {
    const res = await this.pool.query(
      'SELECT 1 FROM secret_santa.santa_participants WHERE game_id = $1 AND telegram_id = $2',
      [gameId, telegramId],
    );
    return res.rows.length > 0;
  }

  async claimAdmin(gameId: number, telegramId: string): Promise<GameSettings> {
    await this.pool.query(
      'UPDATE secret_santa.santa_games SET admin_telegram_id = $1, admin_claim_code = NULL WHERE id = $2',
      [telegramId, gameId],
    );
    return (await this.getGame(gameId))!;
  }

  async updateGameSettings(
    gameId: number,
    patch: Partial<
      Pick<GameSettings, 'title' | 'budget' | 'eventDate' | 'inviteCode'>
    >,
  ): Promise<GameSettings> {
    const current = await this.getGame(gameId);
    if (!current) {
      throw new Error(`Game ${gameId} not found`);
    }
    const nextTitle = patch.title !== undefined ? patch.title : current.title;
    const nextBudget = patch.budget !== undefined ? patch.budget : current.budget;
    const nextDate =
      patch.eventDate !== undefined ? patch.eventDate : current.eventDate;
    const nextInvite =
      patch.inviteCode !== undefined ? patch.inviteCode : current.inviteCode;

    await this.pool.query(
      `UPDATE secret_santa.santa_games
       SET title = $1, budget = $2, event_date = $3, invite_code = $4
       WHERE id = $5`,
      [nextTitle, nextBudget, nextDate, nextInvite, gameId],
    );
    return (await this.getGame(gameId))!;
  }

  async listParticipants(gameId: number): Promise<Participant[]> {
    const res = await this.pool.query<ParticipantRow>(
      'SELECT * FROM secret_santa.santa_participants WHERE game_id = $1 ORDER BY id ASC',
      [gameId],
    );
    return res.rows.map(mapParticipant);
  }

  async getParticipantById(id: number): Promise<Participant | null> {
    const res = await this.pool.query<ParticipantRow>(
      'SELECT * FROM secret_santa.santa_participants WHERE id = $1',
      [id],
    );
    return res.rows[0] ? mapParticipant(res.rows[0]) : null;
  }

  async getParticipantByTelegramId(
    gameId: number,
    telegramId: string,
  ): Promise<Participant | null> {
    const res = await this.pool.query<ParticipantRow>(
      'SELECT * FROM secret_santa.santa_participants WHERE game_id = $1 AND telegram_id = $2',
      [gameId, telegramId],
    );
    return res.rows[0] ? mapParticipant(res.rows[0]) : null;
  }

  async getSantaForRecipient(recipientId: number): Promise<Participant | null> {
    const res = await this.pool.query<ParticipantRow>(
      'SELECT * FROM secret_santa.santa_participants WHERE recipient_id = $1',
      [recipientId],
    );
    return res.rows[0] ? mapParticipant(res.rows[0]) : null;
  }

  async upsertParticipant(
    gameId: number,
    input: {
      telegramId: string;
      username: string | null;
      displayName: string;
    },
  ): Promise<{ participant: Participant; created: boolean }> {
    const existing = await this.getParticipantByTelegramId(
      gameId,
      input.telegramId,
    );
    const now = new Date().toISOString();

    if (existing) {
      await this.pool.query(
        'UPDATE secret_santa.santa_participants SET username = $1, updated_at = $2 WHERE game_id = $3 AND telegram_id = $4',
        [input.username, now, gameId, input.telegramId],
      );
      const updated = (await this.getParticipantByTelegramId(
        gameId,
        input.telegramId,
      ))!;
      return { participant: updated, created: false };
    }

    await this.pool.query(
      `INSERT INTO secret_santa.santa_participants (game_id, telegram_id, username, display_name, joined_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        gameId,
        input.telegramId,
        input.username,
        input.displayName,
        now,
        now,
      ],
    );
    const created = (await this.getParticipantByTelegramId(
      gameId,
      input.telegramId,
    ))!;
    return { participant: created, created: true };
  }

  async updateParticipantProfile(
    gameId: number,
    telegramId: string,
    patch: Partial<
      Pick<Participant, 'displayName' | 'wishlist' | 'antiWishlist' | 'username'>
    >,
  ): Promise<Participant | null> {
    const current = await this.getParticipantByTelegramId(gameId, telegramId);
    if (!current) return null;

    const now = new Date().toISOString();
    await this.pool.query(
      `UPDATE secret_santa.santa_participants
       SET display_name = $1, wishlist = $2, anti_wishlist = $3, username = $4, updated_at = $5
       WHERE game_id = $6 AND telegram_id = $7`,
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
        gameId,
        telegramId,
      ],
    );
    return this.getParticipantByTelegramId(gameId, telegramId);
  }

  async setGiftReady(
    gameId: number,
    telegramId: string,
    ready: boolean,
  ): Promise<Participant | null> {
    const now = new Date().toISOString();
    await this.pool.query(
      'UPDATE secret_santa.santa_participants SET gift_ready = $1, updated_at = $2 WHERE game_id = $3 AND telegram_id = $4',
      [ready, now, gameId, telegramId],
    );
    return this.getParticipantByTelegramId(gameId, telegramId);
  }

  async removeParticipant(
    gameId: number,
    participantId: number,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE secret_santa.santa_participants SET recipient_id = NULL WHERE game_id = $1 AND recipient_id = $2',
        [gameId, participantId],
      );
      await client.query(
        'DELETE FROM secret_santa.santa_participants WHERE game_id = $1 AND id = $2',
        [gameId, participantId],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listExclusions(gameId: number): Promise<Exclusion[]> {
    const res = await this.pool.query<ExclusionRow>(
      'SELECT id, game_id, giver_id, receiver_id FROM secret_santa.santa_exclusions WHERE game_id = $1 ORDER BY id ASC',
      [gameId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      gameId: r.game_id,
      giverId: r.giver_id,
      receiverId: r.receiver_id,
    }));
  }

  async addExclusion(
    gameId: number,
    giverId: number,
    receiverId: number,
    mutual: boolean,
  ): Promise<void> {
    if (giverId === receiverId) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO secret_santa.santa_exclusions (game_id, giver_id, receiver_id)
         VALUES ($1, $2, $3) ON CONFLICT (giver_id, receiver_id) DO NOTHING`,
        [gameId, giverId, receiverId],
      );
      if (mutual) {
        await client.query(
          `INSERT INTO secret_santa.santa_exclusions (game_id, giver_id, receiver_id)
           VALUES ($1, $2, $3) ON CONFLICT (giver_id, receiver_id) DO NOTHING`,
          [gameId, receiverId, giverId],
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

  async removeExclusion(gameId: number, exclusionId: number): Promise<void> {
    await this.pool.query(
      'DELETE FROM secret_santa.santa_exclusions WHERE game_id = $1 AND id = $2',
      [gameId, exclusionId],
    );
  }

  async applyDraw(
    gameId: number,
    assignments: DrawAssignment[],
  ): Promise<GameSettings> {
    const now = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const a of assignments) {
        await client.query(
          'UPDATE secret_santa.santa_participants SET recipient_id = $1, gift_ready = FALSE, updated_at = $2 WHERE game_id = $3 AND id = $4',
          [a.receiverId, now, gameId, a.giverId],
        );
      }
      await client.query(
        `UPDATE secret_santa.santa_games SET status = 'drawn', drawn_at = $1 WHERE id = $2`,
        [now, gameId],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return (await this.getGame(gameId))!;
  }

  async resetDraw(gameId: number): Promise<GameSettings> {
    const now = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE secret_santa.santa_participants SET recipient_id = NULL, gift_ready = FALSE, updated_at = $1 WHERE game_id = $2',
        [now, gameId],
      );
      await client.query(
        `UPDATE secret_santa.santa_games SET status = 'registration', drawn_at = NULL WHERE id = $1`,
        [gameId],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return (await this.getGame(gameId))!;
  }

  async getSession(telegramId: string): Promise<UserSession> {
    const res = await this.pool.query<{
      active_game_id: number | null;
      state_json: string;
    }>(
      'SELECT active_game_id, state_json FROM secret_santa.santa_sessions WHERE telegram_id = $1',
      [telegramId],
    );
    if (res.rows.length === 0) {
      return { activeGameId: null, state: { type: 'idle' } };
    }
    let state: SessionState = { type: 'idle' };
    try {
      state = JSON.parse(res.rows[0].state_json) as SessionState;
    } catch {
      state = { type: 'idle' };
    }
    return {
      activeGameId: res.rows[0].active_game_id ?? null,
      state,
    };
  }

  async setSessionState(
    telegramId: string,
    state: SessionState,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO secret_santa.santa_sessions (telegram_id, active_game_id, state_json, updated_at)
       VALUES ($1, NULL, $2, $3)
       ON CONFLICT (telegram_id) DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = EXCLUDED.updated_at`,
      [telegramId, JSON.stringify(state), now],
    );
  }

  async setActiveGame(
    telegramId: string,
    gameId: number | null,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO secret_santa.santa_sessions (telegram_id, active_game_id, state_json, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (telegram_id) DO UPDATE SET active_game_id = EXCLUDED.active_game_id, updated_at = EXCLUDED.updated_at`,
      [telegramId, gameId, JSON.stringify({ type: 'idle' }), now],
    );
  }
}
