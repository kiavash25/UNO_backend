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

function cardOfType(hand: ExplodingKittensCard[], type: string): ExplodingKittensCard | null {
  return hand.find((card) => card.type === type) ?? null;
}

function cardCount(hand: ExplodingKittensCard[], type: string): number {
  return hand.reduce((count, card) => count + (card.type === type ? 1 : 0), 0);
}

function chooseFavorResponseCard(hand: ExplodingKittensCard[]): ExplodingKittensCard | null {
  const values: Record<string, number> = {
    favor: 25,
    see_future: 45,
    skip: 65,
    attack: 75,
    shuffle: 80,
    defuse: 100,
  };

  return [...hand].sort((left, right) => {
    const leftValue = (values[left.type] ?? 10) - Math.max(0, cardCount(hand, left.type) - 1) * 8;
    const rightValue = (values[right.type] ?? 10) - Math.max(0, cardCount(hand, right.type) - 1) * 8;
    return leftValue - rightValue;
  })[0] ?? null;
}

function chooseBombInsertIndex(state: ExplodingKittensGameState): number {
  const pending = state.pendingAction;
  if (pending?.type !== "defuse") return 0;

  const deckSize = state.drawPile.length;
  if (pending.remainingTurnsAfterDefuse > 0) {
    const safeDepth = Math.min(deckSize, pending.remainingTurnsAfterDefuse + 1);
    return safeDepth + Math.floor(Math.random() * (deckSize - safeDepth + 1));
  }

  if (deckSize === 0) return 0;
  const roll = Math.random();
  if (roll < 0.65) return 0;
  if (roll < 0.9) return Math.min(1, deckSize);
  return Math.floor(Math.random() * (deckSize + 1));
}

function nextAlivePlayer(state: ExplodingKittensGameState, playerId: string) {
  const startIndex = state.players.findIndex((player) => player.id === playerId);
  if (startIndex < 0) return null;

  for (let offset = 1; offset < state.players.length; offset += 1) {
    const player = state.players[(startIndex + offset) % state.players.length];
    if (player?.alive) return player;
  }
  return null;
}

function playCard(card: ExplodingKittensCard): CardGameAction {
  return { type: "play", cardId: card.id };
}

function estimatedBombRisk(state: ExplodingKittensGameState): number {
  if (!state.drawPile.length) return 0;
  const bombs = state.drawPile.reduce(
    (count, card) => count + (card.type === "exploding_kitten" ? 1 : 0),
    0,
  );
  return bombs / state.drawPile.length;
}

function chooseExplodingKittensBotAction(
  state: ExplodingKittensGameState,
  playerId: string,
  _context: BotTurnContext,
): CardGameAction | null {
  const pending = state.pendingAction;
  if (pending?.type === "favor_response" && pending.targetPlayerId === playerId) {
    const hand = state.hands[playerId] ?? [];
    const card = chooseFavorResponseCard(hand);
    return card ? { type: "giveFavorCard", cardId: card.id } : null;
  }

  if (pending?.type === "defuse" && pending.playerId === playerId) {
    if (pending.stage === "awaiting_defuse") {
      return { type: "confirmDefuse" };
    }
    return {
      type: "defuse",
      insertIndex: chooseBombInsertIndex(state),
    };
  }

  if (pending?.type === "nope_window") {
    return { type: "resolveNope" };
  }

  const active = state.players[state.turnIndex];
  if (!active || active.id !== playerId) return null;

  const hand = state.hands[playerId] ?? [];
  const playedThisTurn = new Set(state.playedCardTypesThisTurn?.[playerId] ?? []);
  const peekedCards = state.peekByPlayerId[playerId] ?? [];
  const knownTopCard = peekedCards[0];
  const topIsBomb = knownTopCard?.type === "exploding_kitten";
  const attack = cardOfType(hand, "attack");
  const skip = cardOfType(hand, "skip");
  const shuffle = cardOfType(hand, "shuffle");
  const seeFuture = cardOfType(hand, "see_future");
  const favor = cardOfType(hand, "favor");
  const hasDefuse = Boolean(cardOfType(hand, "defuse"));
  const nextPlayer = nextAlivePlayer(state, playerId);
  const nextPlayerHandSize = nextPlayer ? state.hands[nextPlayer.id]?.length ?? 0 : 0;

  // A known safe card should be drawn instead of wasting more utility cards.
  if (knownTopCard && !topIsBomb) return { type: "draw" };

  if (topIsBomb) {
    if (attack) return playCard(attack);
    if (state.remainingTurns === 1 && skip) return playCard(skip);
    if (shuffle && !playedThisTurn.has("shuffle")) return playCard(shuffle);
    if (skip) return playCard(skip);
    return { type: "draw" };
  }

  if (state.remainingTurns > 1) {
    if (attack) return playCard(attack);
    if (skip) return playCard(skip);
  }

  const bombRisk = estimatedBombRisk(state);
  const aliveCount = state.players.filter((player) => player.alive).length;
  const smallDeck = state.drawPile.length <= Math.max(5, aliveCount * 2);
  const informationThreshold = hasDefuse ? 0.22 : 0.1;
  const defensiveThreshold = hasDefuse ? 0.34 : 0.18;

  if (seeFuture && !playedThisTurn.has("see_future") && (smallDeck || bombRisk >= informationThreshold)) {
    return playCard(seeFuture);
  }

  if (bombRisk >= defensiveThreshold) {
    if (attack) return playCard(attack);
    if (skip) return playCard(skip);
    if (shuffle && !playedThisTurn.has("shuffle")) return playCard(shuffle);
  }

  const vulnerableNextPlayer = nextPlayerHandSize > 0 && nextPlayerHandSize <= 3;
  if (attack && vulnerableNextPlayer && (smallDeck || bombRisk >= 0.12)) {
    return playCard(attack);
  }

  if (favor && !playedThisTurn.has("favor") && bombRisk < defensiveThreshold) {
    const targetPlayerId = botTarget(state, playerId);
    const targetHandSize = targetPlayerId ? state.hands[targetPlayerId]?.length ?? 0 : 0;
    if (targetPlayerId && targetHandSize >= Math.max(4, hand.length)) {
      return { type: "play", cardId: favor.id, targetPlayerId };
    }
  }

  return { type: "draw" };
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
  const recordedEliminations = state.eliminationOrder?.filter(
    (playerId) => state.eliminatedPlayerIds[playerId],
  ) ?? [];
  const recordedIds = new Set(recordedEliminations);
  const legacyEliminations = state.players
    .filter((player) => state.eliminatedPlayerIds[player.id] && !recordedIds.has(player.id))
    .map((player) => player.id);
  const eliminatedPlayers = [...recordedEliminations].reverse().concat(legacyEliminations);
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
    const eligible = !!player && (state.status === "finished" || player.alive === false);
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
