import type { CardGameAction, CardGameDefinition } from "../cardGame/cardGame.js";
import {
  applyExplodingKittensAction,
  createExplodingKittensInitialState,
  finishExplodingKittensTimedMatch,
  handleExplodingKittensTurnTimeout,
  removePlayerFromExplodingKittens,
} from "./gameEngine.js";
import type { ExplodingKittensGameState } from "./gameState.js";
import { projectExplodingKittensGameStateForPlayer } from "./projection.js";
import type { ExplodingKittensAction } from "./types.js";

function isExplodingKittensAction(action: CardGameAction): action is ExplodingKittensAction {
  if (action.type === "draw") return true;
  if ((action.type === "play" || action.type === "playCard") && typeof action.cardId === "string") return true;
  if (
    action.type === "combo" &&
    Array.isArray((action as { cardIds?: unknown } | unknown as { cardIds?: unknown }).cardIds) &&
    (
      action as unknown as {
        cardIds: unknown[];
      }
    ).cardIds.every((cardId) => typeof cardId === "string")
  ) {
    return true;
  }
  if (action.type === "giveFavorCard" && typeof (action as { cardId?: unknown }).cardId === "string") {
    return true;
  }
  if (action.type === "resolveNope") return true;
  return action.type === "defuse";
}

export const explodingKittensGameDefinition: CardGameDefinition<ExplodingKittensGameState> = {
  id: "exploding_kittens",
  displayName: "Exploding Kittens",
  minPlayers: 2,
  maxPlayers: 5,

  createInitialState: createExplodingKittensInitialState,

  projectStateForPlayer: projectExplodingKittensGameStateForPlayer,

  applyAction(state, playerId, action) {
    if (!isExplodingKittensAction(action)) {
      return {
        ok: false,
        code: "action",
        message: "حرکت برای بازی Exploding Kittens معتبر نیست",
      };
    }

    state.lastAction = {
      type: action.type,
      playerId,
      at: Date.now(),
    };
    return applyExplodingKittensAction(state, playerId, action);
  },

  handleTurnTimeout(state, playerId) {
    state.lastAction = {
      type: "timeout",
      playerId,
      at: Date.now(),
    };
    return handleExplodingKittensTurnTimeout(state, playerId);
  },

  finishTimedMatch(state) {
    return finishExplodingKittensTimedMatch(state);
  },

  removePlayer(state, playerId) {
    return removePlayerFromExplodingKittens(state, playerId);
  },

  getPlayerResult(state, playerId) {
    const player = state.players.find((entry) => entry.id === playerId);
    const eligible = state.status === "finished" && !!player && player.alive;
    return { eligible, won: eligible && state.winnerId === playerId };
  },

  getActivePlayerId(state) {
    if (state.status !== "playing") return null;
    if (state.pendingAction?.type === "favor_response") return state.pendingAction.targetPlayerId;
    if (state.pendingAction?.type === "defuse") return state.pendingAction.playerId;
    if (state.pendingAction?.type === "nope_window") return state.pendingAction.resolverPlayerId;
    return state.players[state.turnIndex]?.id ?? null;
  },

  isFinished(state) {
    return state.status === "finished";
  },
};
