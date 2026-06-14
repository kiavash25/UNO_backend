import type { BotTurnContext, CardGameAction, CardGameDefinition } from "../cardGame/cardGame.js";
import type { ExplodingKittensCard } from "./card.js";
import {
  applyExplodingKittensAction,
  createExplodingKittensInitialState,
  finishExplodingKittensTimedMatch,
  handleExplodingKittensTurnTimeout,
  removePlayerFromExplodingKittens,
} from "./gameEngine.js";
import type { ExplodingKittensGameState } from "./gameState.js";
import { projectExplodingKittensGameStateForPlayer } from "./projection.js";
import { explodingKittensRoomConfig } from "./roomConfig.js";
import type { ExplodingKittensAction } from "./types.js";

const botPlayableCardTypes = new Set(["attack", "skip", "shuffle", "see_future", "favor"]);

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
  return action.type === "confirmDefuse" || action.type === "defuse";
}

function botTarget(state: ExplodingKittensGameState, playerId: string): string | undefined {
  const targets = state.players.filter((player) => player.id !== playerId && player.alive && (state.hands[player.id]?.length ?? 0) > 0);
  targets.sort((left, right) => (state.hands[right.id]?.length ?? 0) - (state.hands[left.id]?.length ?? 0));
  return targets[0]?.id;
}

function pickBotCard(hand: ExplodingKittensCard[]): ExplodingKittensCard | null {
  const playable = hand.filter((card) => botPlayableCardTypes.has(card.type));
  if (!playable.length) return null;
  playable.sort((left, right) => {
    const score = (card: ExplodingKittensCard) =>
      card.type === "attack" ? 5 :
      card.type === "skip" ? 4 :
      card.type === "favor" ? 3 :
      card.type === "shuffle" ? 2 :
      card.type === "see_future" ? 1 :
      0;
    return score(right) - score(left);
  });
  return playable[0] ?? null;
}

function chooseExplodingKittensBotAction(
  state: ExplodingKittensGameState,
  playerId: string,
  _context: BotTurnContext,
): CardGameAction | null {
  const pending = state.pendingAction;
  if (pending?.type === "favor_response" && pending.targetPlayerId === playerId) {
    const hand = state.hands[playerId] ?? [];
    const card = hand.find((entry) => entry.type !== "defuse" && entry.type !== "nope") ?? hand[0];
    return card ? { type: "giveFavorCard", cardId: card.id } : null;
  }

  if (pending?.type === "defuse" && pending.playerId === playerId) {
    if (pending.stage === "awaiting_defuse") {
      return { type: "confirmDefuse" };
    }
    return {
      type: "defuse",
      insertIndex: Math.floor(Math.random() * (state.drawPile.length + 1)),
    };
  }

  if (pending?.type === "nope_window") {
    return { type: "resolveNope" };
  }

  const active = state.players[state.turnIndex];
  if (!active || active.id !== playerId) return null;

  const hand = state.hands[playerId] ?? [];
  const picked = pickBotCard(hand);
  if (!picked) return { type: "draw" };

  if (picked.type === "favor") {
    const targetPlayerId = botTarget(state, playerId);
    if (!targetPlayerId) return { type: "draw" };
    return { type: "play", cardId: picked.id, targetPlayerId };
  }

  return { type: "play", cardId: picked.id };
}

function getExplodingKittensRanking(state: ExplodingKittensGameState): string[] {
  const activePlayers = state.players
    .filter((player) => !state.eliminatedPlayerIds[player.id])
    .sort((left, right) => {
      const handDelta = (left.handCount ?? 0) - (right.handCount ?? 0);
      if (handDelta !== 0) return handDelta;
      return left.displayName.localeCompare(right.displayName, "fa");
    });
  const winner = activePlayers.find((player) => player.id === state.winnerId);
  const eliminatedPlayers = state.players
    .filter((player) => state.eliminatedPlayerIds[player.id])
    .map((player) => player.id);
  return [
    ...(winner ? [winner.id] : []),
    ...activePlayers.filter((player) => player.id !== state.winnerId).map((player) => player.id),
    ...eliminatedPlayers,
  ];
}

export const explodingKittensGameDefinition: CardGameDefinition<ExplodingKittensGameState> = {
  id: "exploding_kittens",
  displayName: "Exploding Kittens",
  minPlayers: 2,
  maxPlayers: 5,
  roomConfig: explodingKittensRoomConfig,

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
    const result = handleExplodingKittensTurnTimeout(state, playerId);
    if (!result.ok) return result;
    const eliminated = !!state.eliminatedPlayerIds[playerId];
    return {
      ok: true,
      penaltyCards: result.penaltyCards,
      events: [
        ...(result.events ?? []),
        ...(eliminated
          ? [{
              type: "game.playerEliminated",
              payload: {
                playerId,
                displayName: state.players.find((player) => player.id === playerId)?.displayName ?? "بازیکن",
                reason: "timeout",
              },
            }]
          : [{
              type: "game.turnTimedOut",
              payload: {
                playerId,
                penaltyCards: result.penaltyCards ?? 0,
              },
            }]),
      ],
    };
  },

  finishTimedMatch(state) {
    return finishExplodingKittensTimedMatch(state);
  },

  removePlayer(state, playerId) {
    const result = removePlayerFromExplodingKittens(state, playerId);
    if (!result.ok) return result;
    return {
      ok: true,
      events: [
        ...(result.events ?? []),
        {
          type: "game.playerEliminated",
          payload: {
            playerId,
            displayName: state.players.find((player) => player.id === playerId)?.displayName ?? "بازیکن",
            reason: "disconnect",
          },
        },
      ],
    };
  },

  getPlayerResult(state, playerId) {
    const player = state.players.find((entry) => entry.id === playerId);
    const eligible = state.status === "finished" && !!player && player.alive;
    return { eligible, won: eligible && state.winnerId === playerId };
  },

  getWinnerId(state) {
    return state.winnerId ?? null;
  },

  getRanking(state) {
    return getExplodingKittensRanking(state);
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

  chooseBotAction: chooseExplodingKittensBotAction,
};
