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
}

export interface Participant {
  id: number;
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
  giverId: number;
  receiverId: number;
}

export interface DrawAssignment {
  giverId: number;
  receiverId: number;
}

export type SessionState =
  | { type: 'idle' }
  | { type: 'edit_name' }
  | { type: 'edit_wishlist' }
  | { type: 'edit_antiwishlist' }
  | { type: 'msg_to_recipient' }
  | { type: 'msg_to_santa' }
  | { type: 'admin_edit_title' }
  | { type: 'admin_edit_budget' }
  | { type: 'admin_edit_date' };
