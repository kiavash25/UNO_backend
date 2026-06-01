import { clearPeekState, makeEvent, shuffleCards } from "../engineHelpers.js";
import type { SingleCardEffect } from "../types.js";
import type { ExplodingKittensCardDefinition } from "./types.js";

export const shuffleCardDefinition: ExplodingKittensCardDefinition = {
  type: "shuffle",
  label: "Shuffle",
  copies: 4,
  enabledByDefault: true,
  category: "action",
  canBeNoped: true,
  playMode: "normal",
  onPlay(context) {
    return {
      ok: true,
      pendingEffect: {
        type: "shuffle",
        actorId: context.actorId,
        sourceCardId: context.card.id,
        sourceCardType: context.card.type,
      },
    };
  },
  resolveEffect({ state, effect }: { state: any; effect: SingleCardEffect }) {
    if (effect.type !== "shuffle") {
      return { ok: false, code: "effect", message: "اثر کارت Shuffle نامعتبر است" };
    }

    state.drawPile = shuffleCards(state.drawPile);
    state.drawPileCount = state.drawPile.length;
    clearPeekState(state);
    return {
      ok: true,
      events: [makeEvent("exploding_kittens.shuffleResolved", { actorId: effect.actorId })],
    };
  },
};

