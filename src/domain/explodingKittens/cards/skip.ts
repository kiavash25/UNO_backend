import { consumeCurrentTurn, makeEvent } from "../engineHelpers.js";
import type { SingleCardEffect } from "../types.js";
import type { ExplodingKittensCardDefinition } from "./types.js";

export const skipCardDefinition: ExplodingKittensCardDefinition = {
  type: "skip",
  label: "Skip",
  copies: 4,
  enabledByDefault: true,
  category: "action",
  canBeNoped: true,
  playMode: "normal",
  onPlay(context) {
    return {
      ok: true,
      pendingEffect: {
        type: "skip",
        actorId: context.actorId,
        sourceCardId: context.card.id,
        sourceCardType: context.card.type,
      },
    };
  },
  resolveEffect({ state, effect }: { state: any; effect: SingleCardEffect }) {
    if (effect.type !== "skip") {
      return { ok: false, code: "effect", message: "اثر کارت رد کردن نامعتبر است" };
    }

    const nextPlayerId = consumeCurrentTurn(state);
    return {
      ok: true,
      events: [
        makeEvent("exploding_kittens.skipResolved", {
          actorId: effect.actorId,
          nextPlayerId,
          remainingTurns: state.remainingTurns,
        }),
      ],
    };
  },
};

