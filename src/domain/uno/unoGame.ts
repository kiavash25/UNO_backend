import type { CardGameAction, CardGameDefinition } from "../cardGame/cardGame.js";
import { cardMatchesTop, isWild, type UnoCard } from "./card.js";
import {
  callUno,
  applyTurnTimeout,
  drawCard,
  passAfterDraw,
  playCard,
  startNewGame,
} from "./gameEngine.js";
import type { UnoGameState } from "./gameState.js";
import { projectUnoGameStateForPlayer } from "./projection.js";

type UnoGameAction =
  | { type: "playCard"; cardId: string; chosenColor?: "red" | "yellow" | "green" | "blue"; declareUno?: boolean }
  | { type: "draw" }
  | { type: "pass" }
  | { type: "uno" };

function isUnoAction(action: CardGameAction): action is UnoGameAction {
  if (action.type === "draw" || action.type === "pass" || action.type === "uno") return true;
  return action.type === "playCard" && typeof action.cardId === "string";
}

function chooseBotCard(state: UnoGameState, playerId: string): UnoCard | null {
  const hand = state.hands[playerId] ?? [];
  const top = state.discardPile[state.discardPile.length - 1];
  if (!top) return null;
  const legal = state.pendingDrawStack
    ? hand.filter((c) => c.rank === "wild4" || (c.rank === "draw2" && c.color === state.pendingDrawStack?.color))
    : hand.filter((c) => cardMatchesTop(c, top, state.currentColor));
  if (!legal.length) return null;

  legal.sort((a, b) => {
    const aWild = isWild(a) ? 1 : 0;
    const bWild = isWild(b) ? 1 : 0;
    if (aWild !== bWild) return aWild - bWild;
    if (a.rank === "skip" || a.rank === "reverse" || a.rank === "draw2") return -1;
    if (b.rank === "skip" || b.rank === "reverse" || b.rank === "draw2") return 1;
    return 0;
  });

  const idx = Math.min(legal.length - 1, Math.floor(Math.random() * Math.min(2, legal.length)));
  return legal[idx] ?? legal[0] ?? null;
}

function chooseWildColor(state: UnoGameState, playerId: string): "red" | "yellow" | "green" | "blue" {
  const hand = state.hands[playerId] ?? [];
  const counts: Record<"red" | "yellow" | "green" | "blue", number> = {
    red: 0,
    yellow: 0,
    green: 0,
    blue: 0,
  };
  for (const c of hand) {
    if (c.color === "black") continue;
    counts[c.color] += 1;
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as "red" | "yellow" | "green" | "blue") ?? "red";
}

export const unoGameDefinition: CardGameDefinition<UnoGameState> = {
  id: "uno",
  displayName: "UNO",
  minPlayers: 2,
  maxPlayers: 10,

  createInitialState: startNewGame,

  projectStateForPlayer: projectUnoGameStateForPlayer,

  applyAction(state, playerId, action) {
    if (!isUnoAction(action)) {
      return { ok: false, code: "action", message: "حرکت برای بازی UNO معتبر نیست" };
    }

    const beforeSaidUno = state.players.find((p) => p.id === playerId)?.saidUno ?? false;
    const result =
      action.type === "playCard"
        ? playCard(state, playerId, action.cardId, {
            chosenColor: action.chosenColor,
            declareUno: action.declareUno,
          })
        : action.type === "draw"
          ? drawCard(state, playerId)
          : action.type === "pass"
            ? passAfterDraw(state, playerId)
            : callUno(state, playerId);

    if (!result.ok) return result;

    const afterSaidUno = state.players.find((p) => p.id === playerId)?.saidUno ?? false;
    const events = afterSaidUno && !beforeSaidUno ? [{ type: "uno.declared", payload: { playerId } }] : undefined;
    return { ok: true, events };
  },

  handleTurnTimeout(state, playerId) {
    return applyTurnTimeout(state, playerId);
  },

  getActivePlayerId(state) {
    return state.players[state.turnIndex]?.id ?? null;
  },

  isFinished(state) {
    return state.status === "finished";
  },

  chooseBotAction(state, playerId) {
    const picked = chooseBotCard(state, playerId);
    if (picked) {
      return {
        type: "playCard",
        cardId: picked.id,
        chosenColor: picked.color === "black" ? chooseWildColor(state, playerId) : undefined,
        declareUno: (state.hands[playerId]?.length ?? 0) === 2 && Math.random() > 0.12,
      };
    }

    if (state.pendingDrawPass === playerId) return { type: "pass" };
    return { type: "draw" };
  },
};
