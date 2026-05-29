import { cardMatchesTop, isWild, type UnoCard, type UnoColor } from "./card.js";
import { createShuffledDeck, shuffle } from "./deck.js";
import type { Direction, PlayerId, UnoGameState, UnoPublicPlayer } from "./gameState.js";

export type PlayResult =
  | { ok: true; state: UnoGameState; penaltyCards?: number }
  | { ok: false; code: string; message: string };

function topDiscard(state: UnoGameState): UnoCard {
  const top = state.discardPile[state.discardPile.length - 1];
  if (!top) throw new Error("discard empty");
  return top;
}

function normalizeIndex(i: number, len: number): number {
  return ((i % len) + len) % len;
}

function isEliminated(state: UnoGameState, playerId: PlayerId): boolean {
  return !!state.eliminatedPlayerIds?.[playerId];
}

function activePlayerCount(state: UnoGameState): number {
  return state.players.filter((p) => !isEliminated(state, p.id)).length;
}

function stepActiveTurn(state: UnoGameState, steps: number): number {
  const len = state.players.length;
  let index = state.turnIndex;
  let moved = 0;
  let guard = 0;

  while (moved < steps && guard < len * Math.max(steps, 1) + len) {
    index = normalizeIndex(index + state.direction, len);
    guard += 1;
    if (!isEliminated(state, state.players[index]!.id)) moved += 1;
  }

  return index;
}

function ensureDeck(state: UnoGameState): void {
  if (state.drawPile.length > 0) return;
  const keep = state.discardPile.pop();
  if (!keep) throw new Error("cannot replenish deck");
  const rest = state.discardPile.splice(0, state.discardPile.length);
  state.drawPile = shuffle(rest);
  state.discardPile.push(keep);
}

function popDrawPile(state: UnoGameState): UnoCard {
  ensureDeck(state);
  const c = state.drawPile.pop();
  if (!c) throw new Error("deck still empty after replenish");
  return c;
}

function drawN(state: UnoGameState, playerId: PlayerId, n: number): void {
  const hand = state.hands[playerId];
  if (!hand) throw new Error("unknown player");
  for (let i = 0; i < n; i++) {
    hand.push(popDrawPile(state));
  }
}

function drawForPlayer(state: UnoGameState, playerId: PlayerId): void {
  const hand = state.hands[playerId];
  if (!hand) throw new Error("unknown player");
  hand.push(popDrawPile(state));
}

export function penalizeMissedUno(state: UnoGameState, playerId: PlayerId): boolean {
  const hand = state.hands[playerId];
  if (!hand || hand.length !== 1) return false;

  const pub = state.players.find((p) => p.id === playerId);
  if (!pub || pub.saidUno) return false;

  drawForPlayer(state, playerId);
  pub.saidUno = false;
  syncPublicPlayers(state);
  return true;
}

function isDrawStackCard(card: UnoCard, currentColor: Exclude<UnoColor, "black">): boolean {
  return card.rank === "wild4" || (card.rank === "draw2" && card.color === currentColor);
}

function syncPublicPlayers(state: UnoGameState): void {
  if (!state.eliminatedPlayerIds) state.eliminatedPlayerIds = {};
  state.players = state.players.map((p) => ({
    ...p,
    handCount: state.hands[p.id]?.length ?? 0,
    eliminated: !!state.eliminatedPlayerIds[p.id],
  }));
}

export function startNewGame(
  roster: { id: PlayerId; displayName: string; avatar?: string }[],
): UnoGameState {
  if (roster.length < 2 || roster.length > 10) {
    throw new Error("player count must be 2..10");
  }

  let deck = createShuffledDeck(roster.length);
  const hands: Record<PlayerId, UnoCard[]> = {};
  for (const p of roster) hands[p.id] = [];

  for (let r = 0; r < 7; r++) {
    for (const p of roster) {
      const c = deck.pop();
      if (!c) throw new Error("deck underflow");
      hands[p.id]!.push(c);
    }
  }

  let starter: UnoCard | undefined;
  while (deck.length) {
    const c = deck.pop()!;
    if (!isWild(c)) {
      starter = c;
      break;
    }
    deck.unshift(c);
    deck = shuffle(deck);
  }
  if (!starter) throw new Error("no non-wild starter");

  const discard: UnoCard[] = [starter];
  const currentColor =
    starter.color === "black" ? "red" : (starter.color as Exclude<UnoColor, "black">);

  const players: UnoPublicPlayer[] = roster.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    avatar: p.avatar,
    handCount: hands[p.id]!.length,
    saidUno: false,
    eliminated: false,
  }));

  return {
    status: "playing",
    turnIndex: Math.floor(Math.random() * players.length),
    direction: 1,
    drawPile: deck,
    discardPile: discard,
    currentColor,
    players,
    hands,
    winnerId: null,
    pendingDrawPass: null,
    pendingDrawStack: null,
    turnTimeoutCounts: {},
    eliminatedPlayerIds: {},
  };
}

function currentPlayerId(state: UnoGameState): PlayerId {
  const p = state.players[state.turnIndex];
  if (!p) throw new Error("bad turn index");
  if (isEliminated(state, p.id)) throw new Error("bad turn index");
  return p.id;
}

function applyCardEffect(state: UnoGameState, played: UnoCard, chosenColor?: Exclude<UnoColor, "black">): void {
  const pendingAmount = state.pendingDrawStack?.amount ?? 0;

  if (played.rank === "wild" || played.rank === "wild4") {
    const color = chosenColor ?? "red";
    state.currentColor = color;
    if (played.rank === "wild4") {
      const targetIndex = stepActiveTurn(state, 1);
      const targetId = state.players[targetIndex]!.id;
      state.pendingDrawStack = { playerId: targetId, amount: pendingAmount + 4, color };
      state.turnIndex = targetIndex;
    } else {
      state.pendingDrawStack = null;
      state.turnIndex = stepActiveTurn(state, 1);
    }
    return;
  }

  state.currentColor = played.color as Exclude<UnoColor, "black">;

  switch (played.rank) {
    case "skip":
      state.pendingDrawStack = null;
      state.turnIndex = stepActiveTurn(state, 2);
      break;
    case "reverse":
      state.pendingDrawStack = null;
      state.direction = (state.direction * -1) as Direction;
      if (activePlayerCount(state) === 2) {
        state.turnIndex = stepActiveTurn(state, 1);
      } else {
        state.turnIndex = stepActiveTurn(state, 1);
      }
      break;
    case "draw2": {
      const targetIndex = stepActiveTurn(state, 1);
      const targetId = state.players[targetIndex]!.id;
      state.pendingDrawStack = {
        playerId: targetId,
        amount: pendingAmount + 2,
        color: played.color as Exclude<UnoColor, "black">,
      };
      state.turnIndex = targetIndex;
      break;
    }
    default:
      state.pendingDrawStack = null;
      state.turnIndex = stepActiveTurn(state, 1);
  }
}

export function removePlayerFromGame(state: UnoGameState, playerId: PlayerId): PlayResult {
  if (state.status !== "playing") return { ok: false, code: "finished", message: "بازی تمام شده است" };

  const eliminatedIndex = state.players.findIndex((p) => p.id === playerId);
  if (eliminatedIndex < 0) return { ok: false, code: "player", message: "بازیکن در بازی نیست" };
  if (isEliminated(state, playerId)) return { ok: true, state };

  if (!state.turnTimeoutCounts) state.turnTimeoutCounts = {};
  if (!state.eliminatedPlayerIds) state.eliminatedPlayerIds = {};
  state.eliminatedPlayerIds[playerId] = true;
  delete state.turnTimeoutCounts[playerId];

  if (state.pendingDrawPass === playerId) state.pendingDrawPass = null;
  if (state.pendingDrawStack?.playerId === playerId) state.pendingDrawStack = null;

  const remaining = state.players.filter((p) => !isEliminated(state, p.id));
  if (remaining.length <= 1) {
    state.status = "finished";
    state.winnerId = remaining[0]?.id ?? null;
    state.turnIndex = remaining[0]
      ? state.players.findIndex((p) => p.id === remaining[0]!.id)
      : 0;
    syncPublicPlayers(state);
    return { ok: true, state };
  }

  if (state.turnIndex === eliminatedIndex) {
    state.turnIndex = stepActiveTurn(state, 1);
  }
  syncPublicPlayers(state);
  return { ok: true, state };
}

function resetTurnTimeoutCount(state: UnoGameState, playerId: PlayerId): void {
  if (!state.turnTimeoutCounts) state.turnTimeoutCounts = {};
  state.turnTimeoutCounts[playerId] = 0;
}

export function playCard(
  state: UnoGameState,
  playerId: PlayerId,
  cardId: string,
  opts?: { chosenColor?: Exclude<UnoColor, "black">; declareUno?: boolean },
): PlayResult {
  if (state.status !== "playing") return { ok: false, code: "finished", message: "بازی تمام شده است" };
  if (currentPlayerId(state) !== playerId) return { ok: false, code: "turn", message: "نوبت شما نیست" };

  const hand = state.hands[playerId];
  if (!hand) return { ok: false, code: "player", message: "بازیکن نامعتبر" };

  const idx = hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return { ok: false, code: "card", message: "کارت در دست نیست" };

  const card = hand[idx]!;
  const top = topDiscard(state);

  if (state.pendingDrawStack) {
    if (state.pendingDrawStack.playerId !== playerId) {
      return { ok: false, code: "turn", message: "نوبت شما نیست" };
    }
    if (!isDrawStackCard(card, state.pendingDrawStack.color)) {
      return { ok: false, code: "draw_stack", message: "برای انتقال جریمه باید +4 یا +2 همان رنگ بازی کنید" };
    }
  } else if (!cardMatchesTop(card, top, state.currentColor)) {
    return { ok: false, code: "illegal", message: "این کارت قابل بازی نیست" };
  }

  if (isWild(card) && !opts?.chosenColor) {
    return { ok: false, code: "color", message: "برای wild باید رنگ انتخاب شود" };
  }

  hand.splice(idx, 1);
  resetTurnTimeoutCount(state, playerId);

  state.discardPile.push(card);
  state.pendingDrawPass = null;

  for (const p of state.players) {
    if (p.id !== playerId && (state.hands[p.id]?.length ?? 0) !== 1) p.saidUno = false;
  }

  const nextCount = hand.length;
  if (opts?.declareUno && nextCount === 1) {
    const pub = state.players.find((p) => p.id === playerId);
    if (pub) pub.saidUno = true;
  }

  if (nextCount === 0) {
    state.status = "finished";
    state.winnerId = playerId;
    syncPublicPlayers(state);
    return { ok: true, state };
  }

  applyCardEffect(state, card, opts?.chosenColor);
  syncPublicPlayers(state);
  return { ok: true, state };
}

export function drawCard(state: UnoGameState, playerId: PlayerId): PlayResult {
  if (state.status !== "playing") return { ok: false, code: "finished", message: "بازی تمام شده است" };
  if (currentPlayerId(state) !== playerId) return { ok: false, code: "turn", message: "نوبت شما نیست" };
  if (state.pendingDrawStack) {
    if (state.pendingDrawStack.playerId !== playerId) return { ok: false, code: "turn", message: "نوبت شما نیست" };
    drawN(state, playerId, state.pendingDrawStack.amount);
    resetTurnTimeoutCount(state, playerId);
    state.pendingDrawStack = null;
    state.pendingDrawPass = null;
    state.turnIndex = stepActiveTurn(state, 1);
    syncPublicPlayers(state);
    return { ok: true, state };
  }
  if (state.pendingDrawPass === playerId) return { ok: false, code: "draw", message: "یک بار کارت کشیده‌اید؛ بازی کنید یا پاس دهید" };

  drawForPlayer(state, playerId);
  resetTurnTimeoutCount(state, playerId);
  state.pendingDrawPass = null;
  state.turnIndex = stepActiveTurn(state, 1);
  syncPublicPlayers(state);
  return { ok: true, state };
}

export function passAfterDraw(state: UnoGameState, playerId: PlayerId): PlayResult {
  if (state.status !== "playing") return { ok: false, code: "finished", message: "بازی تمام شده است" };
  if (state.pendingDrawStack) return drawCard(state, playerId);
  if (state.pendingDrawPass !== playerId) return { ok: false, code: "pass", message: "نیازی به پاس نیست" };

  state.pendingDrawPass = null;
  resetTurnTimeoutCount(state, playerId);
  state.turnIndex = stepActiveTurn(state, 1);
  syncPublicPlayers(state);
  return { ok: true, state };
}

export function applyTurnTimeout(state: UnoGameState, playerId: PlayerId): PlayResult {
  if (state.status !== "playing") return { ok: false, code: "finished", message: "بازی تمام شده است" };
  if (currentPlayerId(state) !== playerId) return { ok: false, code: "turn", message: "نوبت شما نیست" };

  if (!state.turnTimeoutCounts) state.turnTimeoutCounts = {};
  const nextTimeoutCount = (state.turnTimeoutCounts[playerId] ?? 0) + 1;
  state.turnTimeoutCounts[playerId] = nextTimeoutCount;
  if (nextTimeoutCount >= 2) {
    return removePlayerFromGame(state, playerId);
  }

  const pendingPenalty =
    state.pendingDrawStack?.playerId === playerId
      ? state.pendingDrawStack.amount
      : 0;
  const penaltyCards = pendingPenalty + 1;
  drawN(state, playerId, penaltyCards);
  state.pendingDrawPass = null;
  state.pendingDrawStack = null;
  state.turnIndex = stepActiveTurn(state, 1);
  syncPublicPlayers(state);
  return { ok: true, state, penaltyCards };
}

export function callUno(state: UnoGameState, playerId: PlayerId): PlayResult {
  if (state.status !== "playing") return { ok: false, code: "finished", message: "بازی تمام شده است" };
  if (isEliminated(state, playerId)) return { ok: false, code: "player", message: "بازیکن از مسابقه خارج شده است" };
  const hand = state.hands[playerId];
  if (!hand) return { ok: false, code: "player", message: "بازیکن نامعتبر" };
  if (hand.length !== 1) return { ok: false, code: "uno", message: "فقط با یک کارت می‌توان UNO گفت" };

  const pub = state.players.find((p) => p.id === playerId);
  if (pub) pub.saidUno = true;
  syncPublicPlayers(state);
  return { ok: true, state };
}
