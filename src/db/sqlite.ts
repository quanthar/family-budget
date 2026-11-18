import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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
  gift_ready: number;
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
    giftReady: row.gift_ready === 1,
    joinedAt: row.joined_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteStore implements SantaStore {
  readonly kind = 'sqlite' as const;
  private db!: DatabaseSync;

  constructor(private readonly dbPath: string) {}

  private runInTx(fn: () => void): void {
    this.db.exec('BEGIN');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async init(defaultInviteCode: string): Promise<void> {
    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(path.resolve(this.dbPath));
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    if (this.dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }

    const existingGamesTable = this.db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'santa_games'",
      )
      .get() as { sql: string } | undefined;

    if (existingGamesTable && existingGamesTable.sql.includes('CHECK')) {
      this.migrateV1ToV2();
    } else if (!existingGamesTable) {
      this.createV2Tables();
    }

    this.db.exec('PRAGMA foreign_keys = ON;');

    // Ensure auxiliary tables exist on all databases
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS santa_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS santa_hosts (
        telegram_id TEXT PRIMARY KEY,
        granted_at TEXT NOT NULL
      );
    `);

    const countRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM santa_games')
      .get() as { cnt: number };

    if (countRow.cnt === 0) {
      const defaultClaimCode = `admin_${crypto.randomBytes(8).toString('hex')}`;
      const now = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO santa_games (title, budget, event_date, invite_code, status, drawn_at, admin_telegram_id, admin_claim_code, created_at)
           VALUES (?, NULL, NULL, ?, 'registration', NULL, NULL, ?, ?)`,
        )
        .run('Тайный Санта 🎄', defaultInviteCode, defaultClaimCode, now);
    }

    const hostCode = `host_${crypto.randomBytes(6).toString('base64url')}`;
    this.db
      .prepare('INSERT OR IGNORE INTO santa_meta (key, value) VALUES (?, ?)')
      .run('host_invite_code', hostCode);
  }

  private createV2Tables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS santa_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        budget TEXT,
        event_date TEXT,
        invite_code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'registration',
        drawn_at TEXT,
        admin_telegram_id TEXT,
        admin_claim_code TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS santa_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL DEFAULT 1,
        telegram_id TEXT NOT NULL,
        username TEXT,
        display_name TEXT NOT NULL,
        wishlist TEXT,
        anti_wishlist TEXT,
        recipient_id INTEGER,
        gift_ready INTEGER NOT NULL DEFAULT 0,
        joined_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (game_id, telegram_id),
        FOREIGN KEY (game_id) REFERENCES santa_games(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS santa_exclusions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL DEFAULT 1,
        giver_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        UNIQUE (giver_id, receiver_id),
        FOREIGN KEY (game_id) REFERENCES santa_games(id) ON DELETE CASCADE,
        FOREIGN KEY (giver_id) REFERENCES santa_participants(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES santa_participants(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS santa_sessions (
        telegram_id TEXT PRIMARY KEY,
        active_game_id INTEGER,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private migrateV1ToV2(): void {
    this.db.exec('PRAGMA foreign_keys = OFF;');
    try {
      const gameCols = this.db
        .prepare('PRAGMA table_info(santa_games)')
        .all() as unknown as Array<{ name: string }>;
      const gameColNames = new Set(gameCols.map((c) => c.name));
      if (!gameColNames.has('admin_telegram_id')) {
        this.db.exec(
          'ALTER TABLE santa_games ADD COLUMN admin_telegram_id TEXT',
        );
      }
      if (!gameColNames.has('admin_claim_code')) {
        this.db.exec(
          'ALTER TABLE santa_games ADD COLUMN admin_claim_code TEXT',
        );
      }

      const now = new Date().toISOString();
      this.runInTx(() => {
        this.db.exec(`
          CREATE TABLE santa_games_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            budget TEXT,
            event_date TEXT,
            invite_code TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'registration',
            drawn_at TEXT,
            admin_telegram_id TEXT,
            admin_claim_code TEXT,
            created_at TEXT NOT NULL
          );

          INSERT INTO santa_games_v2 (
            id, title, budget, event_date, invite_code, status, drawn_at, admin_telegram_id, admin_claim_code, created_at
          )
          SELECT
            id, title, budget, event_date, invite_code, status, drawn_at, admin_telegram_id, admin_claim_code, COALESCE(drawn_at, '${now}')
          FROM santa_games;

          DROP TABLE santa_games;
          ALTER TABLE santa_games_v2 RENAME TO santa_games;

          CREATE TABLE santa_participants_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER NOT NULL DEFAULT 1,
            telegram_id TEXT NOT NULL,
            username TEXT,
            display_name TEXT NOT NULL,
            wishlist TEXT,
            anti_wishlist TEXT,
            recipient_id INTEGER,
            gift_ready INTEGER NOT NULL DEFAULT 0,
            joined_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (game_id, telegram_id),
            FOREIGN KEY (game_id) REFERENCES santa_games(id) ON DELETE CASCADE
          );

          INSERT INTO santa_participants_v2 (
            id, game_id, telegram_id, username, display_name, wishlist, anti_wishlist, recipient_id, gift_ready, joined_at, updated_at
          )
          SELECT
            id, 1, telegram_id, username, display_name, wishlist, anti_wishlist, recipient_id, gift_ready, joined_at, updated_at
          FROM santa_participants;

          DROP TABLE santa_participants;
          ALTER TABLE santa_participants_v2 RENAME TO santa_participants;

          CREATE TABLE santa_exclusions_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER NOT NULL DEFAULT 1,
            giver_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            UNIQUE (giver_id, receiver_id),
            FOREIGN KEY (game_id) REFERENCES santa_games(id) ON DELETE CASCADE,
            FOREIGN KEY (giver_id) REFERENCES santa_participants(id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_id) REFERENCES santa_participants(id) ON DELETE CASCADE
          );

          INSERT INTO santa_exclusions_v2 (id, game_id, giver_id, receiver_id)
          SELECT id, 1, giver_id, receiver_id FROM santa_exclusions;

          DROP TABLE santa_exclusions;
          ALTER TABLE santa_exclusions_v2 RENAME TO santa_exclusions;
        `);

        const sessionCols = this.db
          .prepare('PRAGMA table_info(santa_sessions)')
          .all() as unknown as Array<{ name: string }>;
        if (!sessionCols.some((c) => c.name === 'active_game_id')) {
          this.db.exec(
            'ALTER TABLE santa_sessions ADD COLUMN active_game_id INTEGER;',
          );
          this.db.exec(`
            UPDATE santa_sessions
            SET active_game_id = 1
            WHERE EXISTS (
              SELECT 1 FROM santa_participants p
              WHERE p.telegram_id = santa_sessions.telegram_id AND p.game_id = 1
            );
          `);
        }
      });
    } finally {
      this.db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
  }

  async getHostInviteCode(): Promise<string> {
    const row = this.db
      .prepare("SELECT value FROM santa_meta WHERE key = 'host_invite_code'")
      .get() as { value: string } | undefined;
    if (row) return row.value;
    return this.regenerateHostInviteCode();
  }

  async regenerateHostInviteCode(): Promise<string> {
    const code = `host_${crypto.randomBytes(6).toString('base64url')}`;
    this.db
      .prepare(
        `INSERT INTO santa_meta (key, value) VALUES ('host_invite_code', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(code);
    return code;
  }

  async isHostAllowed(telegramId: string): Promise<boolean> {
    const row = this.db
      .prepare('SELECT 1 FROM santa_hosts WHERE telegram_id = ?')
      .get(telegramId);
    return Boolean(row);
  }

  async grantHostAccess(telegramId: string): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT OR IGNORE INTO santa_hosts (telegram_id, granted_at) VALUES (?, ?)',
      )
      .run(telegramId, now);
  }

  async countHostedGames(telegramId: string): Promise<number> {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) as cnt FROM santa_games WHERE admin_telegram_id = ?',
      )
      .get(telegramId) as { cnt: number };
    return row.cnt;
  }

  async createGame(input: {
    title: string;
    adminTelegramId: string;
    inviteCode: string;
  }): Promise<GameSettings> {
    const now = new Date().toISOString();
    const res = this.db
      .prepare(
        `INSERT INTO santa_games (title, budget, event_date, invite_code, status, drawn_at, admin_telegram_id, admin_claim_code, created_at)
         VALUES (?, NULL, NULL, ?, 'registration', NULL, ?, NULL, ?)`,
      )
      .run(input.title, input.inviteCode, input.adminTelegramId, now);
    const id = Number(res.lastInsertRowid);
    return (await this.getGame(id))!;
  }

  async getGame(gameId: number): Promise<GameSettings | null> {
    const row = this.db
      .prepare('SELECT * FROM santa_games WHERE id = ?')
      .get(gameId) as GameRow | undefined;
    return row ? mapGame(row) : null;
  }

  async getGameByInviteCode(inviteCode: string): Promise<GameSettings | null> {
    const row = this.db
      .prepare('SELECT * FROM santa_games WHERE invite_code = ?')
      .get(inviteCode) as GameRow | undefined;
    return row ? mapGame(row) : null;
  }

  async listGamesForUser(telegramId: string): Promise<GameSettings[]> {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT g.*
         FROM santa_games g
         LEFT JOIN santa_participants p ON p.game_id = g.id AND p.telegram_id = ?
         WHERE g.admin_telegram_id = ? OR p.id IS NOT NULL
         ORDER BY g.id ASC`,
      )
      .all(telegramId, telegramId) as unknown as GameRow[];
    return rows.map(mapGame);
  }

  async isParticipantInGame(
    gameId: number,
    telegramId: string,
  ): Promise<boolean> {
    const row = this.db
      .prepare(
        'SELECT 1 FROM santa_participants WHERE game_id = ? AND telegram_id = ?',
      )
      .get(gameId, telegramId);
    return Boolean(row);
  }

  async claimAdmin(gameId: number, telegramId: string): Promise<GameSettings> {
    this.db
      .prepare(
        'UPDATE santa_games SET admin_telegram_id = ?, admin_claim_code = NULL WHERE id = ?',
      )
      .run(telegramId, gameId);
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

    this.db
      .prepare(
        `UPDATE santa_games
         SET title = ?, budget = ?, event_date = ?, invite_code = ?
         WHERE id = ?`,
      )
      .run(nextTitle, nextBudget, nextDate, nextInvite, gameId);

    return (await this.getGame(gameId))!;
  }

  async listParticipants(gameId: number): Promise<Participant[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM santa_participants WHERE game_id = ? ORDER BY id ASC',
      )
      .all(gameId) as unknown as ParticipantRow[];
    return rows.map(mapParticipant);
  }

  async getParticipantById(id: number): Promise<Participant | null> {
    const row = this.db
      .prepare('SELECT * FROM santa_participants WHERE id = ?')
      .get(id) as ParticipantRow | undefined;
    return row ? mapParticipant(row) : null;
  }

  async getParticipantByTelegramId(
    gameId: number,
    telegramId: string,
  ): Promise<Participant | null> {
    const row = this.db
      .prepare(
        'SELECT * FROM santa_participants WHERE game_id = ? AND telegram_id = ?',
      )
      .get(gameId, telegramId) as ParticipantRow | undefined;
    return row ? mapParticipant(row) : null;
  }

  async getSantaForRecipient(recipientId: number): Promise<Participant | null> {
    const row = this.db
      .prepare('SELECT * FROM santa_participants WHERE recipient_id = ?')
      .get(recipientId) as ParticipantRow | undefined;
    return row ? mapParticipant(row) : null;
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
      this.db
        .prepare(
          `UPDATE santa_participants SET username = ?, updated_at = ? WHERE game_id = ? AND telegram_id = ?`,
        )
        .run(input.username, now, gameId, input.telegramId);
      const updated = (await this.getParticipantByTelegramId(
        gameId,
        input.telegramId,
      ))!;
      return { participant: updated, created: false };
    }

    this.db
      .prepare(
        `INSERT INTO santa_participants (game_id, telegram_id, username, display_name, joined_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        gameId,
        input.telegramId,
        input.username,
        input.displayName,
        now,
        now,
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
    this.db
      .prepare(
        `UPDATE santa_participants
         SET display_name = ?, wishlist = ?, anti_wishlist = ?, username = ?, updated_at = ?
         WHERE game_id = ? AND telegram_id = ?`,
      )
      .run(
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
      );

    return this.getParticipantByTelegramId(gameId, telegramId);
  }

  async setGiftReady(
    gameId: number,
    telegramId: string,
    ready: boolean,
  ): Promise<Participant | null> {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE santa_participants SET gift_ready = ?, updated_at = ? WHERE game_id = ? AND telegram_id = ?`,
      )
      .run(ready ? 1 : 0, now, gameId, telegramId);
    return this.getParticipantByTelegramId(gameId, telegramId);
  }

  async removeParticipant(
    gameId: number,
    participantId: number,
  ): Promise<void> {
    this.runInTx(() => {
      this.db
        .prepare(
          'UPDATE santa_participants SET recipient_id = NULL WHERE game_id = ? AND recipient_id = ?',
        )
        .run(gameId, participantId);
      this.db
        .prepare(
          'DELETE FROM santa_participants WHERE game_id = ? AND id = ?',
        )
        .run(gameId, participantId);
    });
  }

  async listExclusions(gameId: number): Promise<Exclusion[]> {
    const rows = this.db
      .prepare(
        'SELECT id, game_id, giver_id, receiver_id FROM santa_exclusions WHERE game_id = ? ORDER BY id ASC',
      )
      .all(gameId) as unknown as ExclusionRow[];
    return rows.map((r) => ({
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
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO santa_exclusions (game_id, giver_id, receiver_id) VALUES (?, ?, ?)',
    );
    this.runInTx(() => {
      stmt.run(gameId, giverId, receiverId);
      if (mutual) {
        stmt.run(gameId, receiverId, giverId);
      }
    });
  }

  async removeExclusion(gameId: number, exclusionId: number): Promise<void> {
    this.db
      .prepare('DELETE FROM santa_exclusions WHERE game_id = ? AND id = ?')
      .run(gameId, exclusionId);
  }

  async applyDraw(
    gameId: number,
    assignments: DrawAssignment[],
  ): Promise<GameSettings> {
    const now = new Date().toISOString();
    const updateParticipant = this.db.prepare(
      'UPDATE santa_participants SET recipient_id = ?, gift_ready = 0, updated_at = ? WHERE game_id = ? AND id = ?',
    );
    this.runInTx(() => {
      for (const a of assignments) {
        updateParticipant.run(a.receiverId, now, gameId, a.giverId);
      }
      this.db
        .prepare(
          `UPDATE santa_games SET status = 'drawn', drawn_at = ? WHERE id = ?`,
        )
        .run(now, gameId);
    });
    return (await this.getGame(gameId))!;
  }

  async resetDraw(gameId: number): Promise<GameSettings> {
    const now = new Date().toISOString();
    this.runInTx(() => {
      this.db
        .prepare(
          'UPDATE santa_participants SET recipient_id = NULL, gift_ready = 0, updated_at = ? WHERE game_id = ?',
        )
        .run(now, gameId);
      this.db
        .prepare(
          `UPDATE santa_games SET status = 'registration', drawn_at = NULL WHERE id = ?`,
        )
        .run(gameId);
    });
    return (await this.getGame(gameId))!;
  }

  async getSession(telegramId: string): Promise<UserSession> {
    const row = this.db
      .prepare(
        'SELECT active_game_id, state_json FROM santa_sessions WHERE telegram_id = ?',
      )
      .get(telegramId) as
      | { active_game_id: number | null; state_json: string }
      | undefined;
    if (!row) return { activeGameId: null, state: { type: 'idle' } };
    let state: SessionState = { type: 'idle' };
    try {
      state = JSON.parse(row.state_json) as SessionState;
    } catch {
      state = { type: 'idle' };
    }
    return {
      activeGameId: row.active_game_id ?? null,
      state,
    };
  }

  async setSessionState(
    telegramId: string,
    state: SessionState,
  ): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO santa_sessions (telegram_id, active_game_id, state_json, updated_at)
         VALUES (?, NULL, ?, ?)
         ON CONFLICT(telegram_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
      )
      .run(telegramId, JSON.stringify(state), now);
  }

  async setActiveGame(
    telegramId: string,
    gameId: number | null,
  ): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO santa_sessions (telegram_id, active_game_id, state_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(telegram_id) DO UPDATE SET active_game_id = excluded.active_game_id, updated_at = excluded.updated_at`,
      )
      .run(telegramId, gameId, JSON.stringify({ type: 'idle' }), now);
  }
}
