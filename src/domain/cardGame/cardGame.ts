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

export type GameModeValue<T> = {
  classic: T;
  fast: T;
};

export type CardGameRoomConfig = {
  turnTimeoutMs: GameModeValue<number>;
  fastMatchDurationMs: number | null;
  botTurnDelayMs: {
    base: GameModeValue<number>;
    extra: GameModeValue<number>;
  };
};

export type CardGameActionResult =
  | { ok: true; events?: CardGameEvent[]; penaltyCards?: number }
  | { ok: false; code: string; message: string };

export type CardGameAnalyticsActionInput<TState = unknown> = {
  playerId: string;
  action: CardGameAction | { type: "timeout" };
  before: TState;
  after: TState;
  startedAtMs: number;
  endedAtMs: number;
  events?: CardGameEvent[];
  penaltyCards?: number;
};

export type CardGameAnalyticsAdapter<TState = unknown> = {
  buildStartedEvent?(state: TState): Record<string, unknown> | null;
  buildActionEvent?(input: CardGameAnalyticsActionInput<TState>): Record<string, unknown> | null;
  buildReport?(state: TState, events: Record<string, unknown>[]): Record<string, unknown> | undefined;
};

export type BotTurnContext = {
  settings: RoomSettings;
  lobbyPlayers: LobbyPlayer[];
};

export type CardGameDefinition<TState = unknown> = {
  id: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  roomConfig: CardGameRoomConfig;
  analytics?: CardGameAnalyticsAdapter<TState>;
  createInitialState(roster: GameRosterPlayer[]): TState;
  projectStateForPlayer(state: TState, viewerId: string): unknown;
  applyAction(state: TState, playerId: string, action: CardGameAction): CardGameActionResult;
  handleTurnTimeout?(state: TState, playerId: string): CardGameActionResult;
  finishTimedMatch?(state: TState): CardGameActionResult;
  removePlayer?(state: TState, playerId: string): CardGameActionResult;
  getPlayerResult?(state: TState, playerId: string): { eligible: boolean; won: boolean };
  getWinnerId(state: TState): string | null;
  getRanking(state: TState): string[];
  getActivePlayerId(state: TState): string | null;
  isFinished(state: TState): boolean;
  chooseBotAction?(state: TState, playerId: string, context: BotTurnContext): CardGameAction | null;
};
