import type { CardGameRoomConfig } from "../cardGame/cardGame.js";

export const unoRoomConfig: CardGameRoomConfig = {
  turnTimeoutMs: {
    classic: 10_000,
    fast: 4_000,
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
