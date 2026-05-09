export type GameMode = "classic" | "fast";

export type RoomSettings = {
  name: string;
  maxPlayers: number;
  mode: GameMode;
  isPrivate: boolean;
  /** برای حالت سریع (ثانیه) — فعلاً فقط ذخیره می‌شود */
  turnTimeoutSec: number;
};

export type LobbyPlayer = {
  id: string;
  displayName: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
};

export type RoomPhase = "lobby" | "playing" | "finished";

export type RoomSnapshot = {
  roomId: string;
  code: string;
  phase: RoomPhase;
  settings: RoomSettings;
  players: LobbyPlayer[];
  hostId: string;
  gameVersion: number;
};
