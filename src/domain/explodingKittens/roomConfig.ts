import type { CardGameRoomConfig } from "../cardGame/cardGame.js";

export const SEE_FUTURE_VIEW_DURATION_MS = 5_000;

export const explodingKittensRoomConfig: CardGameRoomConfig = {
  turnTimeoutMs: {
    classic: 15_000,
    fast: 5_000,
  },
  fastMatchDurationMs: 60_000,
  eventTurnTimeBonusMs: {
    "exploding_kittens.seeFutureResolved": SEE_FUTURE_VIEW_DURATION_MS,
  },
  botTurnDelayMs: {
    base: {
      classic: 900,
      fast: 400,
    },
    extra: {
      classic: 1_800,
      fast: 1_000,
    },
  },
};
