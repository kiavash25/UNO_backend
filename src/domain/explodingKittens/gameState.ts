import type { ExplodingKittensCard } from "./card.js";
import type { ExplodingKittensPendingAction } from "./types.js";

export type ExplodingKittensPlayerState = {
  id: string;
  displayName: string;
  avatar?: string;
  handCount: number;
  alive: boolean;
};

export type ExplodingKittensStatus = "playing" | "finished";

export type ExplodingKittensGameState = {
  status: ExplodingKittensStatus;
  players: ExplodingKittensPlayerState[];
  turnIndex: number;
  remainingTurns: number;
  drawPileCount: number;
  drawPile: ExplodingKittensCard[];
  discardPile: ExplodingKittensCard[];
  hands: Record<string, ExplodingKittensCard[]>;
  winnerId: string | null;
  eliminatedPlayerIds: Record<string, boolean>;
  pendingAttackStacks: number;
  pendingAction: ExplodingKittensPendingAction | null;
  peekByPlayerId: Record<string, ExplodingKittensCard[]>;
  enabledCardTypes: string[];
  lastAction?: {
    type: string;
    playerId: string;
    at: number;
  };
};

export type ExplodingKittensPlayerProjection = {
  status: ExplodingKittensStatus;
  turnIndex: number;
  currentPlayerId: string | null;
  remainingTurns: number;
  drawPileCount: number;
  discardPile: ExplodingKittensCard[];
  players: ExplodingKittensPlayerState[];
  myHand: ExplodingKittensCard[];
  winnerId: string | null;
  pendingAttackStacks: number;
  peekedCards: ExplodingKittensCard[];
  pendingAction: ExplodingKittensPendingAction | null;
  enabledCardTypes: string[];
  rules: {
    seeFutureViewDurationMs: number;
  };
};
