import { isPostgresUrl } from '../config.js';
import type {
  DrawAssignment,
  Exclusion,
  GameSettings,
  Participant,
  SessionState,
} from '../types.js';
import { PostgresStore } from './postgres.js';
import { SqliteStore } from './sqlite.js';

export interface SantaStore {
  readonly kind: 'sqlite' | 'postgres';
  init(defaultInviteCode: string): Promise<void>;
  close(): Promise<void>;

  getGame(): Promise<GameSettings>;
  claimAdmin(telegramId: string): Promise<GameSettings>;
  updateGameSettings(
    patch: Partial<
      Pick<GameSettings, 'title' | 'budget' | 'eventDate' | 'inviteCode'>
    >,
  ): Promise<GameSettings>;

  listParticipants(): Promise<Participant[]>;
  getParticipantById(id: number): Promise<Participant | null>;
  getParticipantByTelegramId(telegramId: string): Promise<Participant | null>;
  getSantaForRecipient(recipientId: number): Promise<Participant | null>;
  upsertParticipant(input: {
    telegramId: string;
    username: string | null;
    displayName: string;
  }): Promise<{ participant: Participant; created: boolean }>;
  updateParticipantProfile(
    telegramId: string,
    patch: Partial<
      Pick<Participant, 'displayName' | 'wishlist' | 'antiWishlist' | 'username'>
    >,
  ): Promise<Participant | null>;
  setGiftReady(telegramId: string, ready: boolean): Promise<Participant | null>;
  removeParticipant(participantId: number): Promise<void>;

  listExclusions(): Promise<Exclusion[]>;
  addExclusion(
    giverId: number,
    receiverId: number,
    mutual: boolean,
  ): Promise<void>;
  removeExclusion(exclusionId: number): Promise<void>;

  applyDraw(assignments: DrawAssignment[]): Promise<GameSettings>;
  resetDraw(): Promise<GameSettings>;

  getSession(telegramId: string): Promise<SessionState>;
  setSession(telegramId: string, state: SessionState): Promise<void>;
}

export function createStore(
  databaseUrl: string | undefined,
  sqlitePath: string,
): SantaStore {
  if (databaseUrl && isPostgresUrl(databaseUrl)) {
    return new PostgresStore(databaseUrl);
  }
  const resolvedSqlitePath =
    databaseUrl && databaseUrl.startsWith('file:')
      ? databaseUrl.slice('file:'.length)
      : sqlitePath;
  return new SqliteStore(resolvedSqlitePath);
}
