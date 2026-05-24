import type { CardGameAction, CardGameDefinition, CardGameEvent } from "../cardGame/cardGame.js";
import { cardMatchesTop, isWild, type UnoCard } from "./card.js";
import {
  callUno,
  applyTurnTimeout,
  drawCard,
  passAfterDraw,
  penalizeMissedUno,
  playCard,
  removePlayerFromGame,
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

function nextActivePlayerId(state: UnoGameState): string | null {
  if (!state.players.length) return null;
  let index = state.turnIndex;
  for (let i = 0; i < state.players.length; i++) {
    index = ((index + state.direction) % state.players.length + state.players.length) % state.players.length;
    const player = state.players[index];
    if (player && !state.eliminatedPlayerIds?.[player.id]) return player.id;
  }
  return null;
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
    const playedCard =
      action.type === "playCard" ? state.hands[playerId]?.find((card) => card.id === action.cardId) : null;
    const skippedPlayerId =
      playedCard?.rank === "skip"
        ? nextActivePlayerId(state)
        : null;
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
    const events: CardGameEvent[] = [];
    if (action.type === "playCard" && state.status === "playing") {
      for (const player of state.players) {
        if (player.id === playerId) continue;
        if (state.eliminatedPlayerIds?.[player.id]) continue;
        if (penalizeMissedUno(state, player.id)) {
          events.push({
            type: "uno.missedPenalty",
            payload: {
              playerId: player.id,
              byPlayerId: playerId,
              penaltyCards: 1,
            },
          });
        }
      }
    }
    if (skippedPlayerId && state.status === "playing") {
      events.push({ type: "uno.playerSkipped", payload: { playerId: skippedPlayerId, byPlayerId: playerId } });
    }
    if (afterSaidUno && !beforeSaidUno) events.push({ type: "uno.declared", payload: { playerId } });
    return { ok: true, events };
  },

  handleTurnTimeout(state, playerId) {
    const player = state.players.find((p) => p.id === playerId);
    const result = applyTurnTimeout(state, playerId);
    if (!result.ok) return result;
    const stillPlaying = !state.eliminatedPlayerIds?.[playerId];
    return {
      ok: true,
      events: stillPlaying
        ? []
        : [
            {
              type: "uno.playerEliminated",
              payload: {
                playerId,
                displayName: player?.displayName ?? "بازیکن",
                reason: "timeout",
              },
            },
          ],
    };
  },

  removePlayer(state, playerId) {
    const player = state.players.find((p) => p.id === playerId);
    const result = removePlayerFromGame(state, playerId);
    if (!result.ok) return result;
    return {
      ok: true,
      events: [
        {
          type: "uno.playerEliminated",
          payload: {
            playerId,
            displayName: player?.displayName ?? "بازیکن",
            reason: "disconnect",
          },
        },
      ],
    };
  },

  getPlayerResult(state, playerId) {
    const player = state.players.find((p) => p.id === playerId);
    const eliminated = !!state.eliminatedPlayerIds?.[playerId];
    const eligible = state.status === "finished" && !!state.winnerId && !!player && !eliminated;
    return { eligible, won: eligible && state.winnerId === playerId };
  },

  getActivePlayerId(state) {
    const player = state.players[state.turnIndex];
    if (!player || state.eliminatedPlayerIds?.[player.id]) return null;
    return player.id;
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
