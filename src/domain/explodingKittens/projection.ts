import type { ExplodingKittensGameState, ExplodingKittensPlayerProjection } from "./gameState.js";
import { SEE_FUTURE_VIEW_DURATION_MS } from "./roomConfig.js";

export function projectExplodingKittensGameStateForPlayer(
  state: ExplodingKittensGameState,
  viewerId: string,
): ExplodingKittensPlayerProjection {
  return {
    status: state.status,
    turnIndex: state.turnIndex,
    currentPlayerId: state.players[state.turnIndex]?.id ?? null,
    remainingTurns: state.remainingTurns,
    drawPileCount: state.drawPileCount,
    discardPile: state.discardPile,
    players: state.players,
    myHand: state.hands[viewerId] ?? [],
    winnerId: state.winnerId,
    pendingAttackStacks: state.pendingAttackStacks,
    peekedCards: state.peekByPlayerId[viewerId] ?? [],
    pendingAction: state.pendingAction,
    enabledCardTypes: state.enabledCardTypes,
    rules: {
      seeFutureViewDurationMs: SEE_FUTURE_VIEW_DURATION_MS,
    },
  };
}
