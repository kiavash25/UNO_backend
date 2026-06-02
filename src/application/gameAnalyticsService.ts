import { createHash } from "crypto";
import type { Redis } from "ioredis";
import { getCardGame } from "../domain/cardGame/gameRegistry.js";
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

type GameActionAnalyticsInput = {
  state: LiveRoomState;
  playerId: string;
  action: { type: string; [key: string]: unknown };
  before: unknown;
  startedAtMs: number;
  endedAtMs: number;
  events?: { type: string; payload?: Record<string, unknown> }[];
  penaltyCards?: number;
};

const ANALYTICS_TTL_SEC = 60 * 60 * 24 * 14;

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

  private gameForState(state: LiveRoomState) {
    return getCardGame(state.settings.gameId ?? "uno");
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

    const startedEvent = this.gameForState(state)?.analytics?.buildStartedEvent?.(state.game);
    if (startedEvent) {
      await this.appendEvent(state.id, startedEvent);
    }
  }

  async gameAction(input: GameActionAnalyticsInput): Promise<void> {
    if (!input.state.game) return;
    const event = this.gameForState(input.state)?.analytics?.buildActionEvent?.({
      playerId: input.playerId,
      action: input.action,
      before: input.before,
      after: input.state.game,
      startedAtMs: input.startedAtMs,
      endedAtMs: input.endedAtMs,
      events: input.events,
      penaltyCards: input.penaltyCards,
    });
    if (event) {
      await this.appendEvent(input.state.id, event);
    }
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
    const startedAtMs = meta.startedAtMs ?? meta.createdAtMs;
    const playerIds = Object.keys(meta.playersById);
    const game = this.gameForState(state);
    const ranking = game?.getRanking(state.game) ?? playerIds;
    const winnerId = game?.getWinnerId(state.game) ?? null;
    const gameReport = game?.analytics?.buildReport?.(state.game, events);

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
      winnerId,
      ranking,
      rewards: normalizeRewards(playerIds, rewards),
      events,
      gameReport,
    });
  }
}
