import type { CardGameActionResult, CardGameEvent } from "../../cardGame/cardGame.js";
import type { ExplodingKittensCard } from "../card.js";
import type { ExplodingKittensGameState } from "../gameState.js";
import type { ExplodingKittensPendingEffect } from "../types.js";

export type SingleCardPlayAction = {
  type: "play" | "playCard";
  cardId: string;
  targetPlayerId?: string;
  requestedCardType?: string;
};

export type ExplodingKittensCardCategory = "action" | "cat" | "special";

export type CardPlayResult =
  | { ok: true; pendingEffect?: ExplodingKittensPendingEffect; events?: CardGameEvent[] }
  | { ok: false; code: string; message: string };

export type CardEffectResolutionResult = CardGameActionResult;

export type CardPlayContext = {
  state: ExplodingKittensGameState;
  actorId: string;
  card: ExplodingKittensCard;
  action: SingleCardPlayAction;
};

export type CardEffectResolutionContext<TEffect extends ExplodingKittensPendingEffect> = {
  state: ExplodingKittensGameState;
  effect: TEffect;
};

export type ExplodingKittensCardDefinition = {
  type: string;
  label: string;
  copies: number;
  enabledByDefault: boolean;
  category: ExplodingKittensCardCategory;
  comboFamily?: string;
  canBeNoped?: boolean;
  playMode: "normal" | "response_only" | "never";
  onPlay?: (context: CardPlayContext) => CardPlayResult;
  resolveEffect?: (context: CardEffectResolutionContext<any>) => CardEffectResolutionResult;
};

export type ConfiguredExplodingKittensCardDefinition = Omit<
  ExplodingKittensCardDefinition,
  "enabledByDefault"
> & {
  enabled: boolean;
};

