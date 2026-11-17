import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
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
  gift_ready: number;
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
    giftReady: row.gift_ready === 1,
    joinedAt: row.joined_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteStore implements SantaStore {
  readonly kind = 'sqlite' as const;
  private db!: Database.Database;

  constructor(private readonly dbPath: string) {}

  async init(defaultInviteCode: string): Promise<void> {
    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(path.resolve(this.dbPath));
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
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

      CREATE TABLE IF NOT EXISTS santa_participants (
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

      CREATE TABLE IF NOT EXISTS santa_exclusions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        giver_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        UNIQUE (giver_id, receiver_id),
        FOREIGN KEY (giver_id) REFERENCES santa_participants(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES santa_participants(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS santa_sessions (
        telegram_id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const cols = this.db
      .prepare('PRAGMA table_info(santa_games)')
      .all() as Array<{ name: string }>;
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has('admin_telegram_id')) {
      this.db.exec('ALTER TABLE santa_games ADD COLUMN admin_telegram_id TEXT');
    }
    if (!colNames.has('admin_claim_code')) {
      this.db.exec('ALTER TABLE santa_games ADD COLUMN admin_claim_code TEXT');
    }

    const defaultClaimCode = `admin_${crypto.randomBytes(8).toString('hex')}`;
    this.db
      .prepare(
        `INSERT OR IGNORE INTO santa_games (id, title, budget, event_date, invite_code, status, drawn_at, admin_telegram_id, admin_claim_code)
         VALUES (1, ?, NULL, NULL, ?, 'registration', NULL, NULL, ?)`,
      )
      .run('Тайный Санта 🎄', defaultInviteCode, defaultClaimCode);
  }

  async claimAdmin(telegramId: string): Promise<GameSettings> {
    this.db
      .prepare(
        'UPDATE santa_games SET admin_telegram_id = ?, admin_claim_code = NULL WHERE id = 1',
      )
      .run(telegramId);
    return this.getGame();
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
  }

  async getGame(): Promise<GameSettings> {
    const row = this.db
      .prepare('SELECT * FROM santa_games WHERE id = 1')
      .get() as GameRow | undefined;
    if (!row) {
      throw new Error('Game settings row missing');
    }
    return mapGame(row);
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

    this.db
      .prepare(
        `UPDATE santa_games
         SET title = ?, budget = ?, event_date = ?, invite_code = ?
         WHERE id = 1`,
      )
      .run(nextTitle, nextBudget, nextDate, nextInvite);

    return this.getGame();
  }

  async listParticipants(): Promise<Participant[]> {
    const rows = this.db
      .prepare('SELECT * FROM santa_participants ORDER BY id ASC')
      .all() as ParticipantRow[];
    return rows.map(mapParticipant);
  }

  async getParticipantById(id: number): Promise<Participant | null> {
    const row = this.db
      .prepare('SELECT * FROM santa_participants WHERE id = ?')
      .get(id) as ParticipantRow | undefined;
    return row ? mapParticipant(row) : null;
  }

  async getParticipantByTelegramId(
    telegramId: string,
  ): Promise<Participant | null> {
    const row = this.db
      .prepare('SELECT * FROM santa_participants WHERE telegram_id = ?')
      .get(telegramId) as ParticipantRow | undefined;
    return row ? mapParticipant(row) : null;
  }

  async getSantaForRecipient(recipientId: number): Promise<Participant | null> {
    const row = this.db
      .prepare('SELECT * FROM santa_participants WHERE recipient_id = ?')
      .get(recipientId) as ParticipantRow | undefined;
    return row ? mapParticipant(row) : null;
  }

  async upsertParticipant(input: {
    telegramId: string;
    username: string | null;
    displayName: string;
  }): Promise<{ participant: Participant; created: boolean }> {
    const existing = await this.getParticipantByTelegramId(input.telegramId);
    const now = new Date().toISOString();

    if (existing) {
      this.db
        .prepare(
          `UPDATE santa_participants SET username = ?, updated_at = ? WHERE telegram_id = ?`,
        )
        .run(input.username, now, input.telegramId);
      const updated = (await this.getParticipantByTelegramId(input.telegramId))!;
      return { participant: updated, created: false };
    }

    this.db
      .prepare(
        `INSERT INTO santa_participants (telegram_id, username, display_name, joined_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.telegramId, input.username, input.displayName, now, now);

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
    this.db
      .prepare(
        `UPDATE santa_participants
         SET display_name = ?, wishlist = ?, anti_wishlist = ?, username = ?, updated_at = ?
         WHERE telegram_id = ?`,
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
        telegramId,
      );

    return this.getParticipantByTelegramId(telegramId);
  }

  async setGiftReady(
    telegramId: string,
    ready: boolean,
  ): Promise<Participant | null> {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE santa_participants SET gift_ready = ?, updated_at = ? WHERE telegram_id = ?`,
      )
      .run(ready ? 1 : 0, now, telegramId);
    return this.getParticipantByTelegramId(telegramId);
  }

  async removeParticipant(participantId: number): Promise<void> {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          'UPDATE santa_participants SET recipient_id = NULL WHERE recipient_id = ?',
        )
        .run(participantId);
      this.db
        .prepare('DELETE FROM santa_participants WHERE id = ?')
        .run(participantId);
    });
    tx();
  }

  async listExclusions(): Promise<Exclusion[]> {
    const rows = this.db
      .prepare('SELECT id, giver_id, receiver_id FROM santa_exclusions ORDER BY id ASC')
      .all() as ExclusionRow[];
    return rows.map((r) => ({
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
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO santa_exclusions (giver_id, receiver_id) VALUES (?, ?)',
    );
    const tx = this.db.transaction(() => {
      stmt.run(giverId, receiverId);
      if (mutual) {
        stmt.run(receiverId, giverId);
      }
    });
    tx();
  }

  async removeExclusion(exclusionId: number): Promise<void> {
    this.db
      .prepare('DELETE FROM santa_exclusions WHERE id = ?')
      .run(exclusionId);
  }

  async applyDraw(assignments: DrawAssignment[]): Promise<GameSettings> {
    const now = new Date().toISOString();
    const updateParticipant = this.db.prepare(
      'UPDATE santa_participants SET recipient_id = ?, gift_ready = 0, updated_at = ? WHERE id = ?',
    );
    const tx = this.db.transaction(() => {
      for (const a of assignments) {
        updateParticipant.run(a.receiverId, now, a.giverId);
      }
      this.db
        .prepare(
          `UPDATE santa_games SET status = 'drawn', drawn_at = ? WHERE id = 1`,
        )
        .run(now);
    });
    tx();
    return this.getGame();
  }

  async resetDraw(): Promise<GameSettings> {
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          'UPDATE santa_participants SET recipient_id = NULL, gift_ready = 0, updated_at = ?',
        )
        .run(now);
      this.db
        .prepare(
          `UPDATE santa_games SET status = 'registration', drawn_at = NULL WHERE id = 1`,
        )
        .run();
    });
    tx();
    return this.getGame();
  }

  async getSession(telegramId: string): Promise<SessionState> {
    const row = this.db
      .prepare('SELECT state_json FROM santa_sessions WHERE telegram_id = ?')
      .get(telegramId) as { state_json: string } | undefined;
    if (!row) return { type: 'idle' };
    try {
      return JSON.parse(row.state_json) as SessionState;
    } catch {
      return { type: 'idle' };
    }
  }

  async setSession(telegramId: string, state: SessionState): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO santa_sessions (telegram_id, state_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(telegram_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
      )
      .run(telegramId, JSON.stringify(state), now);
  }
}
