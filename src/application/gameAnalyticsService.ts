import { createHash } from "crypto";
import type { Redis } from "ioredis";
import type { CardGameAction, CardGameEvent } from "../domain/cardGame/cardGame.js";
import type { UnoCard, UnoColor } from "../domain/uno/card.js";
import type { UnoGameState } from "../domain/uno/gameState.js";
import type { GameReportRepository } from "../infrastructure/mongo/gameReportRepository.js";
import { redisKeys } from "../infrastructure/redis/keys.js";
import type { LiveRoomState } from "./liveRoomState.js";
import type { LobbyPlayer } from "./roomTypes.js";

type AnalyticsPlayer = {
  playerId: string;
  userId?: string;
  sessionId?: string;
  displayName: string;
  avatar?: string;
  isBot: boolean;
  device?: string;
};

type AnalyticsMeta = {
  roomId: string;
  code: string;
  gameId: string;
  isPrivate: boolean;
  hostPlayerId: string;
  hostUserId?: string;
  createdAtMs: number;
  startedAtMs?: number;
  finishedAtMs?: number;
  playersById: Record<string, AnalyticsPlayer>;
};

type UnoActionAnalytics = {
  roomId: string;
  playerId: string;
  action: CardGameAction | { type: "timeout" };
  before: UnoGameState;
  after: UnoGameState;
  startedAtMs: number;
  endedAtMs: number;
  events?: CardGameEvent[];
  penaltyCards?: number;
};

const ANALYTICS_TTL_SEC = 60 * 60 * 24 * 14;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function topDiscard(state: UnoGameState): UnoCard | null {
  return state.discardPile[state.discardPile.length - 1] ?? null;
}

function publicPlayer(lobby: LobbyPlayer, userId?: string, sessionId?: string): AnalyticsPlayer {
  return {
    playerId: lobby.id,
    userId: userId ?? lobby.profile?.id,
    sessionId,
    displayName: lobby.displayName,
    avatar: lobby.avatar,
    isBot: !!lobby.isBot,
    device: lobby.isBot ? "bot" : undefined,
  };
}

function detectDevice(userAgent: string | undefined): string {
  if (!userAgent) return "unknown";
  if (/bot|crawler|spider/i.test(userAgent)) return "bot";
  if (/tablet|ipad/i.test(userAgent)) return "tablet";
  if (/mobile|android|iphone|ipod/i.test(userAgent)) return "mobile";
  return "desktop";
}

function sessionAnalyticsId(sessionToken: string): string {
  return createHash("sha256").update(sessionToken).digest("hex").slice(0, 24);
}

function activeRanking(state: UnoGameState): string[] {
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

function normalizeRewards(playerIds: string[], rewards: unknown[]): unknown[] {
  const byPlayerId = new Map<string, unknown>();
  for (const reward of rewards) {
    if (!reward || typeof reward !== "object") continue;
    const playerId = (reward as { playerId?: unknown }).playerId;
    if (typeof playerId === "string") byPlayerId.set(playerId, reward);
  }
  return playerIds.map((playerId) => byPlayerId.get(playerId) ?? {
    playerId,
    rank: null,
    xp: 0,
    coins: 0,
  });
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
        if (gameEvent.type === "uno.playerEliminated") eliminations.push({ ...gameEvent.payload, ts: event.ts });
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

export class GameAnalyticsService {
  constructor(
    private readonly redis: Redis,
    private readonly reports: GameReportRepository,
  ) {}

  private metaKey(roomId: string): string {
    return redisKeys.gameAnalyticsMeta(roomId);
  }

  private eventsKey(roomId: string): string {
    return redisKeys.gameAnalyticsEvents(roomId);
  }

  private async loadMeta(roomId: string): Promise<AnalyticsMeta | null> {
    const raw = await this.redis.get(this.metaKey(roomId));
    return raw ? JSON.parse(raw) as AnalyticsMeta : null;
  }

  private async saveMeta(meta: AnalyticsMeta): Promise<void> {
    await this.redis.set(this.metaKey(meta.roomId), JSON.stringify(meta), "EX", ANALYTICS_TTL_SEC);
  }

  private fallbackMeta(state: LiveRoomState): AnalyticsMeta {
    return {
      roomId: state.id,
      code: state.code,
      gameId: state.settings.gameId ?? "uno",
      isPrivate: state.settings.isPrivate,
      hostPlayerId: state.hostId,
      createdAtMs: Date.now(),
      playersById: Object.fromEntries(state.players.map((player) => [player.id, publicPlayer(player)])),
    };
  }

  private async appendEvent(roomId: string, event: Record<string, unknown>): Promise<void> {
    const key = this.eventsKey(roomId);
    await this.redis.rpush(key, JSON.stringify({ ...event, ts: Date.now() }));
    await this.redis.expire(key, ANALYTICS_TTL_SEC);
  }

  async roomCreated(state: LiveRoomState, sessionId: string, userId?: string): Promise<void> {
    const host = state.players.find((player) => player.id === state.hostId);
    const existing = await this.loadMeta(state.id);
    const meta: AnalyticsMeta = {
      roomId: state.id,
      code: state.code,
      gameId: state.settings.gameId ?? "uno",
      isPrivate: state.settings.isPrivate,
      hostPlayerId: state.hostId,
      hostUserId: userId,
      createdAtMs: existing?.createdAtMs ?? Date.now(),
      startedAtMs: existing?.startedAtMs,
      finishedAtMs: existing?.finishedAtMs,
      playersById: {
        ...(existing?.playersById ?? {}),
        ...(host ? { [host.id]: publicPlayer(host, userId, sessionAnalyticsId(sessionId)) } : {}),
      },
    };
    await this.saveMeta(meta);
  }

  async playerJoined(state: LiveRoomState, playerId: string, sessionId: string, userId?: string): Promise<void> {
    const meta = await this.loadMeta(state.id) ?? this.fallbackMeta(state);
    const player = state.players.find((item) => item.id === playerId);
    if (!player) return;
    meta.playersById[player.id] = {
      ...meta.playersById[player.id],
      ...publicPlayer(player, userId, sessionAnalyticsId(sessionId)),
    };
    await this.saveMeta(meta);
  }

  async playerDevice(state: LiveRoomState, playerId: string, userAgent?: string): Promise<void> {
    const meta = await this.loadMeta(state.id) ?? this.fallbackMeta(state);
    if (!meta.playersById[playerId]) return;
    meta.playersById[playerId] = {
      ...meta.playersById[playerId],
      device: meta.playersById[playerId].isBot ? "bot" : detectDevice(userAgent),
    };
    await this.saveMeta(meta);
  }

  async gameStarted(state: LiveRoomState): Promise<void> {
    const meta = await this.loadMeta(state.id) ?? this.fallbackMeta(state);
    if (!state.game) return;
    meta.startedAtMs = Date.now();
    for (const player of state.players) {
      meta.playersById[player.id] = {
        ...meta.playersById[player.id],
        ...publicPlayer(player, meta.playersById[player.id]?.userId, meta.playersById[player.id]?.sessionId),
      };
    }
    await this.saveMeta(meta);

    if ((state.settings.gameId ?? "uno") !== "uno") return;
    const uno = state.game as UnoGameState;
    await this.appendEvent(state.id, {
      type: "uno.started",
      startingHands: clone(uno.hands),
      topDiscard: topDiscard(uno),
      currentColor: uno.currentColor,
      turnIndex: uno.turnIndex,
      direction: uno.direction,
    });
  }

  async unoAction(input: UnoActionAnalytics): Promise<void> {
    const action = input.action as CardGameAction & { chosenColor?: Exclude<UnoColor, "black">; declareUno?: boolean };
    const afterPlayer = input.after.players.find((player) => player.id === input.playerId);
    await this.appendEvent(input.roomId, {
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
    });
  }

  async chat(state: LiveRoomState, playerId: string, text?: string, emoji?: string): Promise<void> {
    await this.appendEvent(state.id, {
      type: "chat",
      phase: state.phase,
      playerId,
      text,
      emoji,
    });
  }

  async playerEliminated(state: LiveRoomState, playerId: string, reason: string): Promise<void> {
    await this.appendEvent(state.id, {
      type: "player.eliminated",
      playerId,
      reason,
    });
  }

  async finishGame(state: LiveRoomState, rewards: unknown[]): Promise<void> {
    if (!state.game) return;
    const meta = await this.loadMeta(state.id) ?? this.fallbackMeta(state);
    const finishedAtMs = Date.now();
    meta.finishedAtMs = meta.finishedAtMs ?? finishedAtMs;
    await this.saveMeta(meta);

    const rawEvents = await this.redis.lrange(this.eventsKey(state.id), 0, -1);
    const events = rawEvents.map((raw) => JSON.parse(raw) as Record<string, unknown>);
    const uno = state.game as UnoGameState;
    const startedAtMs = meta.startedAtMs ?? meta.createdAtMs;
    const playerIds = Object.keys(meta.playersById);
    await this.reports.upsert({
      roomId: meta.roomId,
      code: meta.code,
      gameId: meta.gameId,
      isPrivate: meta.isPrivate,
      hostPlayerId: meta.hostPlayerId,
      hostUserId: meta.hostUserId,
      createdAtMs: meta.createdAtMs,
      startedAtMs,
      finishedAtMs: meta.finishedAtMs,
      durationMs: meta.finishedAtMs - startedAtMs,
      players: Object.values(meta.playersById),
      winnerId: uno.winnerId ?? null,
      ranking: activeRanking(uno),
      rewards: normalizeRewards(playerIds, rewards),
      events,
      gameReport: meta.gameId === "uno" ? summarizeUno(events) : undefined,
    });
  }
}
