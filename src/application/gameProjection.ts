import type { PlayerId, UnoGameState } from "../domain/uno/gameState.js";

/** نمای بازی برای یک کلاینت: دست بقیه مخفی است. */
export function projectGameStateForPlayer(state: UnoGameState, viewerId: PlayerId) {
  return {
    status: state.status,
    turnIndex: state.turnIndex,
    direction: state.direction,
    currentColor: state.currentColor,
    discardPile: state.discardPile,
    drawPileCount: state.drawPile.length,
    players: state.players,
    myHand: state.hands[viewerId] ?? [],
    winnerId: state.winnerId,
    pendingDrawPass: state.pendingDrawPass,
  };
}
