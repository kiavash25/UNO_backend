import type { CardGameEvent } from "../cardGame/cardGame.js";
import type { ExplodingKittensCard } from "./card.js";
import type { ExplodingKittensGameState } from "./gameState.js";

export function shuffleCards<T>(cards: readonly T[]): T[] {
  const next = [...cards];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const temp = next[index];
    next[index] = next[swapIndex]!;
    next[swapIndex] = temp!;
  }
  return next;
}

export function syncPlayers(state: ExplodingKittensGameState): void {
  state.drawPileCount = state.drawPile.length;
  state.players = state.players.map((player) => ({
    ...player,
    handCount: state.hands[player.id]?.length ?? 0,
    alive: !state.eliminatedPlayerIds[player.id],
  }));
}

export function clearPeekState(state: ExplodingKittensGameState): void {
  state.peekByPlayerId = {};
}

export function setPeekForPlayer(
  state: ExplodingKittensGameState,
  playerId: string,
  cards: ExplodingKittensCard[],
): void {
  state.peekByPlayerId[playerId] = cards.map((card) => ({ ...card }));
}

export function alivePlayerIds(state: ExplodingKittensGameState): string[] {
  return state.players.filter((player) => !state.eliminatedPlayerIds[player.id]).map((player) => player.id);
}

export function isPlayerAlive(state: ExplodingKittensGameState, playerId: string): boolean {
  return !state.eliminatedPlayerIds[playerId];
}

export function currentPlayerId(state: ExplodingKittensGameState): string | null {
  const player = state.players[state.turnIndex];
  if (!player || !isPlayerAlive(state, player.id)) return null;
  return player.id;
}

function normalizeIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

export function advanceTurn(state: ExplodingKittensGameState, turns = 1): string | null {
  const aliveIds = alivePlayerIds(state);
  if (aliveIds.length <= 1) {
    state.remainingTurns = 0;
    state.pendingAttackStacks = 0;
    return aliveIds[0] ?? null;
  }

  let nextIndex = state.turnIndex;
  let moved = 0;
  let guard = 0;

  while (moved < 1 && guard < state.players.length * 2) {
    nextIndex = normalizeIndex(nextIndex + 1, state.players.length);
    guard += 1;
    if (isPlayerAlive(state, state.players[nextIndex]!.id)) moved += 1;
  }

  state.turnIndex = nextIndex;
  state.remainingTurns = Math.max(1, turns);
  state.pendingAttackStacks = state.remainingTurns > 1 ? state.remainingTurns : 0;
  state.playedCardTypesThisTurn = {};
  clearPeekState(state);
  return currentPlayerId(state);
}

export function consumeCurrentTurn(state: ExplodingKittensGameState): string | null {
  if (state.remainingTurns > 1) {
    state.remainingTurns -= 1;
    state.pendingAttackStacks = state.remainingTurns;
    state.playedCardTypesThisTurn = {};
    clearPeekState(state);
    return currentPlayerId(state);
  }

  return advanceTurn(state, 1);
}

export function markWinnerIfNeeded(state: ExplodingKittensGameState): void {
  const aliveIds = alivePlayerIds(state);
  if (aliveIds.length === 1) {
    state.status = "finished";
    state.winnerId = aliveIds[0]!;
    state.remainingTurns = 0;
    state.pendingAttackStacks = 0;
    state.pendingAction = null;
  }
}

export function eliminatePlayer(state: ExplodingKittensGameState, playerId: string): void {
  if (state.eliminatedPlayerIds[playerId]) return;

  const wasCurrentPlayer = state.players[state.turnIndex]?.id === playerId;
  state.eliminatedPlayerIds[playerId] = true;
  state.eliminationOrder ??= [];
  state.eliminationOrder.push(playerId);
  delete state.peekByPlayerId[playerId];
  markWinnerIfNeeded(state);

  if (state.status === "finished") {
    syncPlayers(state);
    return;
  }

  if (wasCurrentPlayer) {
    advanceTurn(state, 1);
  }

  syncPlayers(state);
}

export function drawTopCard(state: ExplodingKittensGameState): ExplodingKittensCard {
  const card = state.drawPile.pop();
  if (!card) {
    throw new Error("draw pile is empty");
  }
  state.drawPileCount = state.drawPile.length;
  return card;
}

export function giveCardToPlayer(
  state: ExplodingKittensGameState,
  playerId: string,
  card: ExplodingKittensCard,
): void {
  state.hands[playerId] ??= [];
  state.hands[playerId]!.push(card);
  syncPlayers(state);
}

export function insertCardIntoDrawPile(
  state: ExplodingKittensGameState,
  card: ExplodingKittensCard,
  insertIndex?: number,
): void {
  const normalized =
    insertIndex === undefined
      ? Math.floor(Math.random() * (state.drawPile.length + 1))
      : Math.max(0, Math.min(state.drawPile.length, Math.floor(insertIndex)));

  const insertionPoint = state.drawPile.length - normalized;
  state.drawPile.splice(insertionPoint, 0, card);
  state.drawPileCount = state.drawPile.length;
}

export function removeCardFromHand(
  state: ExplodingKittensGameState,
  playerId: string,
  cardId: string,
): ExplodingKittensCard | null {
  const hand = state.hands[playerId];
  if (!hand) return null;
  const index = hand.findIndex((card) => card.id === cardId);
  if (index < 0) return null;
  const [card] = hand.splice(index, 1);
  syncPlayers(state);
  return card ?? null;
}

export function removeCardsFromHand(
  state: ExplodingKittensGameState,
  playerId: string,
  cardIds: string[],
): ExplodingKittensCard[] | null {
  const hand = state.hands[playerId];
  if (!hand) return null;

  const cards: ExplodingKittensCard[] = [];
  for (const cardId of cardIds) {
    const index = hand.findIndex((card) => card.id === cardId);
    if (index < 0) return null;
    const [card] = hand.splice(index, 1);
    if (!card) return null;
    cards.push(card);
  }

  syncPlayers(state);
  return cards;
}

export function discardCards(state: ExplodingKittensGameState, cards: ExplodingKittensCard[]): void {
  state.discardPile.push(...cards);
}

export function revealTopCards(state: ExplodingKittensGameState, count: number): ExplodingKittensCard[] {
  return state.drawPile.slice(Math.max(0, state.drawPile.length - count)).reverse();
}

export function stealRandomCard(
  state: ExplodingKittensGameState,
  fromPlayerId: string,
  toPlayerId: string,
): ExplodingKittensCard | null {
  const hand = state.hands[fromPlayerId];
  if (!hand?.length) return null;
  const index = Math.floor(Math.random() * hand.length);
  const [card] = hand.splice(index, 1);
  if (!card) return null;
  state.hands[toPlayerId] ??= [];
  state.hands[toPlayerId]!.push(card);
  syncPlayers(state);
  return card;
}

export function stealNamedCard(
  state: ExplodingKittensGameState,
  fromPlayerId: string,
  toPlayerId: string,
  cardType: string,
): ExplodingKittensCard | null {
  const hand = state.hands[fromPlayerId];
  if (!hand?.length) return null;
  const index = hand.findIndex((card) => card.type === cardType);
  if (index < 0) return null;
  const [card] = hand.splice(index, 1);
  if (!card) return null;
  state.hands[toPlayerId] ??= [];
  state.hands[toPlayerId]!.push(card);
  syncPlayers(state);
  return card;
}

export function takeDiscardCard(
  state: ExplodingKittensGameState,
  discardCardId: string,
): ExplodingKittensCard | null {
  const index = state.discardPile.findIndex((card) => card.id === discardCardId);
  if (index < 0) return null;
  const [card] = state.discardPile.splice(index, 1);
  return card ?? null;
}

export function pickTimedWinner(state: ExplodingKittensGameState): string | null {
  const alivePlayers = state.players.filter((player) => !state.eliminatedPlayerIds[player.id]);
  if (!alivePlayers.length) return null;

  alivePlayers.sort((left, right) => {
    const handDelta = (left.handCount ?? 0) - (right.handCount ?? 0);
    if (handDelta !== 0) return handDelta;
    return left.displayName.localeCompare(right.displayName, "fa");
  });

  return alivePlayers[0]?.id ?? null;
}

export function makeEvent(type: string, payload?: Record<string, unknown>): CardGameEvent {
  return { type, payload };
}
