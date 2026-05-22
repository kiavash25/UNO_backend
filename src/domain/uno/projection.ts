import type { PlayerId, UnoGameState } from "./gameState.js";

export function projectUnoGameStateForPlayer(state: UnoGameState, viewerId: PlayerId) {
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

