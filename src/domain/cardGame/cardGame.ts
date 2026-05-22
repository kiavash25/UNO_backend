import type { LobbyPlayer, RoomSettings } from "../../application/roomTypes.js";

export type GameRosterPlayer = {
  id: string;
  displayName: string;
  avatar?: string;
};

export type CardGameAction = {
  type: string;
  [key: string]: unknown;
};

export type CardGameEvent = {
  type: string;
  payload?: Record<string, unknown>;
};

export type CardGameActionResult =
  | { ok: true; events?: CardGameEvent[] }
  | { ok: false; code: string; message: string };

export type BotTurnContext = {
  settings: RoomSettings;
  lobbyPlayers: LobbyPlayer[];
};

export type CardGameDefinition<TState = unknown> = {
  id: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  createInitialState(roster: GameRosterPlayer[]): TState;
  projectStateForPlayer(state: TState, viewerId: string): unknown;
  applyAction(state: TState, playerId: string, action: CardGameAction): CardGameActionResult;
  getActivePlayerId(state: TState): string | null;
  isFinished(state: TState): boolean;
  chooseBotAction?(state: TState, playerId: string, context: BotTurnContext): CardGameAction | null;
};

