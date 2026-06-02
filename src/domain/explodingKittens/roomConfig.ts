import type { CardGameRoomConfig } from "../cardGame/cardGame.js";

export const explodingKittensRoomConfig: CardGameRoomConfig = {
  turnTimeoutMs: {
    classic: 15_000,
    fast: 5_000,
  },
  fastMatchDurationMs: 60_000,
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
