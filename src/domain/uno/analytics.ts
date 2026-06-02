import type { CardGameAnalyticsAdapter, CardGameEvent } from "../cardGame/cardGame.js";
import type { UnoCard, UnoColor } from "./card.js";
import type { UnoGameState } from "./gameState.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function topDiscard(state: UnoGameState): UnoCard | null {
  return state.discardPile[state.discardPile.length - 1] ?? null;
}

export function getUnoRanking(state: UnoGameState): string[] {
  const active = state.players
    .filter((player) => !player.eliminated && !state.eliminatedPlayerIds?.[player.id])
    .sort((a, b) => a.handCount - b.handCount);
  const winner = active.find((player) => player.id === state.winnerId);
  const eliminated = state.players
    .filter((player) => player.eliminated || state.eliminatedPlayerIds?.[player.id])
    .map((player) => player.id);
  return [
    ...(winner ? [winner.id] : []),
    ...active.filter((player) => player.id !== state.winnerId).map((player) => player.id),
    ...eliminated,
  ];
}

function summarizeUno(events: Record<string, unknown>[]): Record<string, unknown> {
  const startingHands: Record<string, UnoCard[]> = {};
  const timeoutPenalties: Record<string, number> = {};
  const eliminations: unknown[] = [];
  const chats: unknown[] = [];

  for (const event of events) {
    if (event.type === "uno.started") {
      Object.assign(startingHands, event.startingHands);
    }
    if (event.type === "uno.action") {
      const playerId = String(event.playerId ?? "");
      const action = event.action as { type?: string } | undefined;
      if (playerId && action?.type === "timeout") {
        timeoutPenalties[playerId] = (timeoutPenalties[playerId] ?? 0) + 1;
      }
      const gameEvents = Array.isArray(event.events) ? event.events : [];
      for (const gameEvent of gameEvents as CardGameEvent[]) {
        if (gameEvent.type === "game.playerEliminated") eliminations.push({ ...gameEvent.payload, ts: event.ts });
      }
    }
    if (event.type === "chat") chats.push(event);
  }

  return {
    game: "uno",
    startingHands,
    timeoutPenalties,
    eliminations,
    chats,
  };
}

export const unoAnalytics: CardGameAnalyticsAdapter<UnoGameState> = {
  buildStartedEvent(state) {
    return {
      type: "uno.started",
      startingHands: clone(state.hands),
      topDiscard: topDiscard(state),
      currentColor: state.currentColor,
      turnIndex: state.turnIndex,
      direction: state.direction,
    };
  },

  buildActionEvent(input) {
    const action = input.action as {
      type: string;
      chosenColor?: Exclude<UnoColor, "black">;
      declareUno?: boolean;
    };
    const afterPlayer = input.after.players.find((player) => player.id === input.playerId);
    return {
      type: "uno.action",
      playerId: input.playerId,
      action: clone(input.action),
      responseTimeMs: Math.max(0, input.endedAtMs - input.startedAtMs),
      before: {
        hand: clone(input.before.hands[input.playerId] ?? []),
        allHands: clone(input.before.hands),
        topDiscard: topDiscard(input.before),
        currentColor: input.before.currentColor,
        turnIndex: input.before.turnIndex,
        direction: input.before.direction,
      },
      after: {
        hand: clone(input.after.hands[input.playerId] ?? []),
        allHands: clone(input.after.hands),
        topDiscard: topDiscard(input.after),
        currentColor: input.after.currentColor,
        turnIndex: input.after.turnIndex,
        direction: input.after.direction,
      },
      declaredUno: action.type === "uno" || !!action.declareUno,
      saidUnoAfterAction: !!afterPlayer?.saidUno,
      chosenColor: action.chosenColor,
      directionChanged: input.before.direction !== input.after.direction,
      penaltyCards: input.penaltyCards,
      timeoutCount: input.after.turnTimeoutCounts?.[input.playerId] ?? 0,
      events: input.events ?? [],
    };
  },

  buildReport(_state, events) {
    return summarizeUno(events);
  },
};
