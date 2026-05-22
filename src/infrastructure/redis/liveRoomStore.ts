import type { Redis } from "ioredis";
import type { LiveRoomState } from "../../application/liveRoomState.js";
import { legacyUnoRedisKeys, redisKeys } from "./keys.js";

export class LiveRoomStore {
  constructor(private readonly redis: Redis) {}

  async save(state: LiveRoomState): Promise<void> {
    const key = redisKeys.liveRoom(state.id);
    await this.redis.set(key, JSON.stringify(state));
    await this.redis.set(redisKeys.roomByCode(state.code), state.id);
    await this.syncPublicLobbyIndex(state);
  }

  private async syncPublicLobbyIndex(state: LiveRoomState): Promise<void> {
    const indexKey = redisKeys.publicLobbyRooms();
    const eligible =
      !state.settings.isPrivate &&
      state.phase === "lobby" &&
      state.players.length < state.settings.maxPlayers;

    if (eligible) {
      await this.redis.sadd(indexKey, state.id);
    } else {
      await this.redis.srem(indexKey, state.id);
    }
  }

  async listPublicLobbyRoomIds(): Promise<string[]> {
    const [current, legacy] = await Promise.all([
      this.redis.smembers(redisKeys.publicLobbyRooms()),
      this.redis.smembers(legacyUnoRedisKeys.publicLobbyRooms()),
    ]);
    return [...new Set([...current, ...legacy])];
  }

  async removeFromPublicLobbyIndex(roomId: string): Promise<void> {
    await this.redis.srem(redisKeys.publicLobbyRooms(), roomId);
    await this.redis.srem(legacyUnoRedisKeys.publicLobbyRooms(), roomId);
  }

  async load(roomId: string): Promise<LiveRoomState | null> {
    const raw = await this.redis.get(redisKeys.liveRoom(roomId)) ?? await this.redis.get(legacyUnoRedisKeys.liveRoom(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as LiveRoomState;
  }

  async findRoomIdByCode(code: string): Promise<string | null> {
    const upper = code.toUpperCase();
    return this.redis.get(redisKeys.roomByCode(upper)) ?? this.redis.get(legacyUnoRedisKeys.roomByCode(upper));
  }

  async delete(roomId: string): Promise<void> {
    const state = await this.load(roomId);
    if (state) {
      await this.redis.del(
        redisKeys.liveRoom(roomId),
        redisKeys.roomByCode(state.code),
        legacyUnoRedisKeys.liveRoom(roomId),
        legacyUnoRedisKeys.roomByCode(state.code),
      );
    }
  }
}
