import { makeEvent, revealTopCards, setPeekForPlayer } from "../engineHelpers.js";
import type { SingleCardEffect } from "../types.js";
import type { ExplodingKittensCardDefinition } from "./types.js";

export const seeFutureCardDefinition: ExplodingKittensCardDefinition = {
  type: "see_future",
  label: "See The Future",
  copies: 5,
  enabledByDefault: true,
  category: "action",
  canBeNoped: true,
  playMode: "normal",
  onPlay(context) {
    return {
      ok: true,
      pendingEffect: {
        type: "see_future",
        actorId: context.actorId,
        sourceCardId: context.card.id,
        sourceCardType: context.card.type,
      },
    };
  },
  resolveEffect({ state, effect }: { state: any; effect: SingleCardEffect }) {
    if (effect.type !== "see_future") {
      return { ok: false, code: "effect", message: "اثر کارت See The Future نامعتبر است" };
    }

    const cards = revealTopCards(state, 3);
    setPeekForPlayer(state, effect.actorId, cards);
    return {
      ok: true,
      events: [
        makeEvent("exploding_kittens.seeFutureResolved", {
          actorId: effect.actorId,
          count: cards.length,
        }),
      ],
    };
  },
};

