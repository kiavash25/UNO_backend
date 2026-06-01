import { makeEvent } from "../engineHelpers.js";
import type { SingleCardEffect } from "../types.js";
import type { ExplodingKittensCardDefinition } from "./types.js";

export const favorCardDefinition: ExplodingKittensCardDefinition = {
  type: "favor",
  label: "Favor",
  copies: 4,
  enabledByDefault: true,
  category: "action",
  canBeNoped: true,
  playMode: "normal",
  onPlay(context) {
    if (!context.action.targetPlayerId) {
      return { ok: false, code: "target", message: "برای کارت Favor باید بازیکن هدف انتخاب شود" };
    }

    return {
      ok: true,
      pendingEffect: {
        type: "favor",
        actorId: context.actorId,
        sourceCardId: context.card.id,
        sourceCardType: context.card.type,
        targetPlayerId: context.action.targetPlayerId,
      },
    };
  },
  resolveEffect({ state, effect }: { state: any; effect: SingleCardEffect }) {
    if (effect.type !== "favor") {
      return { ok: false, code: "effect", message: "اثر کارت Favor نامعتبر است" };
    }

    const targetHand = state.hands[effect.targetPlayerId] ?? [];
    if (!targetHand.length) {
      return {
        ok: true,
        events: [
          makeEvent("exploding_kittens.favorSkipped", {
            actorId: effect.actorId,
            targetPlayerId: effect.targetPlayerId,
          }),
        ],
      };
    }

    state.pendingAction = {
      type: "favor_response",
      actorId: effect.actorId,
      targetPlayerId: effect.targetPlayerId,
      resolverPlayerId: effect.targetPlayerId,
    };
    return {
      ok: true,
      events: [
        makeEvent("exploding_kittens.favorRequested", {
          actorId: effect.actorId,
          targetPlayerId: effect.targetPlayerId,
        }),
      ],
    };
  },
};

