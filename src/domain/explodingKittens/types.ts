import type { ExplodingKittensCard } from "./card.js";

export type ExplodingKittensAction =
  | { type: "draw" }
  | {
      type: "play";
      cardId: string;
      targetPlayerId?: string;
      requestedCardType?: string;
    }
  | {
      type: "playCard";
      cardId: string;
      targetPlayerId?: string;
      requestedCardType?: string;
    }
  | {
      type: "combo";
      cardIds: string[];
      targetPlayerId?: string;
      requestedCardType?: string;
      discardCardId?: string;
    }
  | { type: "giveFavorCard"; cardId: string }
  | { type: "resolveNope"; allow?: boolean }
  | { type: "defuse"; insertIndex?: number };

export type SingleCardEffect =
  | {
      type: "attack";
      actorId: string;
      sourceCardId: string;
      sourceCardType: string;
    }
  | {
      type: "skip";
      actorId: string;
      sourceCardId: string;
      sourceCardType: string;
    }
  | {
      type: "favor";
      actorId: string;
      sourceCardId: string;
      sourceCardType: string;
      targetPlayerId: string;
    }
  | {
      type: "shuffle";
      actorId: string;
      sourceCardId: string;
      sourceCardType: string;
    }
  | {
      type: "see_future";
      actorId: string;
      sourceCardId: string;
      sourceCardType: string;
    };

export type ComboEffect =
  | {
      type: "combo_steal";
      actorId: string;
      sourceCardType: "combo_pair";
      cardIds: string[];
      targetPlayerId: string;
    }
  | {
      type: "combo_request";
      actorId: string;
      sourceCardType: "combo_triple";
      cardIds: string[];
      targetPlayerId: string;
      requestedCardType: string;
    }
  | {
      type: "combo_retrieve";
      actorId: string;
      sourceCardType: "combo_five";
      cardIds: string[];
      discardCardId: string;
    };

export type ExplodingKittensPendingEffect = SingleCardEffect | ComboEffect;

export type ExplodingKittensPendingAction =
  | {
      type: "nope_window";
      effect: ExplodingKittensPendingEffect;
      nopeCount: number;
      resolverPlayerId: string;
      respondedPlayerIds: string[];
    }
  | {
      type: "favor_response";
      actorId: string;
      targetPlayerId: string;
      resolverPlayerId: string;
    }
  | {
      type: "defuse";
      playerId: string;
      resolverPlayerId: string;
      explodingKittenCard: ExplodingKittensCard;
      remainingTurnsAfterDefuse: number;
    };

