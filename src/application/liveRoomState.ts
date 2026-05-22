import type { LobbyPlayer, RoomPhase, RoomSettings } from "./roomTypes.js";

export type LiveRoomState = {
  id: string;
  code: string;
  settings: RoomSettings;
  hostId: string;
  players: LobbyPlayer[];
  phase: RoomPhase;
  game: unknown | null;
  version: number;
};
