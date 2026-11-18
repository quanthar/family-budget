export type GameStatus = 'registration' | 'drawn';

export interface GameSettings {
  id: number;
  title: string;
  budget: string | null;
  eventDate: string | null;
  inviteCode: string;
  status: GameStatus;
  drawnAt: string | null;
  adminTelegramId: string | null;
  adminClaimCode: string | null;
  createdAt: string;
}

export interface Participant {
  id: number;
  gameId: number;
  telegramId: string;
  username: string | null;
  displayName: string;
  wishlist: string | null;
  antiWishlist: string | null;
  recipientId: number | null;
  giftReady: boolean;
  joinedAt: string;
  updatedAt: string;
}

export interface Exclusion {
  id: number;
  gameId: number;
  giverId: number;
  receiverId: number;
}

export interface DrawAssignment {
  giverId: number;
  receiverId: number;
}

export type SessionState =
  | { type: 'idle' }
  | { type: 'create_game_title' }
  | { type: 'edit_name'; gameId: number }
  | { type: 'edit_wishlist'; gameId: number; append?: boolean }
  | { type: 'edit_antiwishlist'; gameId: number }
  | { type: 'msg_to_recipient'; gameId: number }
  | { type: 'msg_to_santa'; gameId: number }
  | { type: 'admin_edit_title'; gameId: number }
  | { type: 'admin_edit_budget'; gameId: number }
  | { type: 'admin_edit_date'; gameId: number };

export interface UserSession {
  activeGameId: number | null;
  state: SessionState;
}
