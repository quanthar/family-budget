import { isPostgresUrl } from '../config.js';
import type {
  DrawAssignment,
  Exclusion,
  GameSettings,
  Participant,
  SessionState,
  UserSession,
} from '../types.js';
import { PostgresStore } from './postgres.js';
import { SqliteStore } from './sqlite.js';

export interface SantaStore {
  readonly kind: 'sqlite' | 'postgres';
  init(defaultInviteCode: string): Promise<void>;
  close(): Promise<void>;

  getHostInviteCode(): Promise<string>;
  regenerateHostInviteCode(): Promise<string>;
  isHostAllowed(telegramId: string): Promise<boolean>;
  grantHostAccess(telegramId: string): Promise<void>;
  countHostedGames(telegramId: string): Promise<number>;

  createGame(input: {
    title: string;
    adminTelegramId: string;
    inviteCode: string;
  }): Promise<GameSettings>;
  getGame(gameId: number): Promise<GameSettings | null>;
  getGameByInviteCode(inviteCode: string): Promise<GameSettings | null>;
  listGamesForUser(telegramId: string): Promise<GameSettings[]>;
  isParticipantInGame(gameId: number, telegramId: string): Promise<boolean>;

  claimAdmin(gameId: number, telegramId: string): Promise<GameSettings>;
  updateGameSettings(
    gameId: number,
    patch: Partial<
      Pick<GameSettings, 'title' | 'budget' | 'eventDate' | 'inviteCode'>
    >,
  ): Promise<GameSettings>;

  listParticipants(gameId: number): Promise<Participant[]>;
  getParticipantById(id: number): Promise<Participant | null>;
  getParticipantByTelegramId(
    gameId: number,
    telegramId: string,
  ): Promise<Participant | null>;
  getSantaForRecipient(recipientId: number): Promise<Participant | null>;
  upsertParticipant(
    gameId: number,
    input: {
      telegramId: string;
      username: string | null;
      displayName: string;
    },
  ): Promise<{ participant: Participant; created: boolean }>;
  updateParticipantProfile(
    gameId: number,
    telegramId: string,
    patch: Partial<
      Pick<Participant, 'displayName' | 'wishlist' | 'antiWishlist' | 'username'>
    >,
  ): Promise<Participant | null>;
  setGiftReady(
    gameId: number,
    telegramId: string,
    ready: boolean,
  ): Promise<Participant | null>;
  removeParticipant(gameId: number, participantId: number): Promise<void>;

  listExclusions(gameId: number): Promise<Exclusion[]>;
  addExclusion(
    gameId: number,
    giverId: number,
    receiverId: number,
    mutual: boolean,
  ): Promise<void>;
  removeExclusion(gameId: number, exclusionId: number): Promise<void>;

  applyDraw(
    gameId: number,
    assignments: DrawAssignment[],
  ): Promise<GameSettings>;
  resetDraw(gameId: number): Promise<GameSettings>;

  getSession(telegramId: string): Promise<UserSession>;
  setSessionState(telegramId: string, state: SessionState): Promise<void>;
  setActiveGame(telegramId: string, gameId: number | null): Promise<void>;
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
