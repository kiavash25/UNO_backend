import { advanceTurn, makeEvent } from "../engineHelpers.js";
import type { SingleCardEffect } from "../types.js";
import type { ExplodingKittensCardDefinition } from "./types.js";

export const attackCardDefinition: ExplodingKittensCardDefinition = {
  type: "attack",
  label: "Attack",
  copies: 4,
  enabledByDefault: true,
  category: "action",
  canBeNoped: true,
  playMode: "normal",
  onPlay(context) {
    return {
      ok: true,
      pendingEffect: {
        type: "attack",
        actorId: context.actorId,
        sourceCardId: context.card.id,
        sourceCardType: context.card.type,
      },
    };
  },
  resolveEffect({ state, effect }: { state: any; effect: SingleCardEffect }) {
    if (effect.type !== "attack") {
      return { ok: false, code: "effect", message: "اثر کارت حمله نامعتبر است" };
    }

    const nextTurns = Math.max(2, state.remainingTurns + 1);
    const targetPlayerId = advanceTurn(state, nextTurns);
    return {
      ok: true,
      events: [
        makeEvent("exploding_kittens.attackResolved", {
          actorId: effect.actorId,
          targetPlayerId,
          turns: nextTurns,
        }),
      ],
    };
  },
};

