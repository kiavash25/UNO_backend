import type { Redis } from "ioredis";
import type { LiveRoomState } from "../../application/liveRoomState.js";
import { redisKeys } from "./keys.js";

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
    return this.redis.smembers(redisKeys.publicLobbyRooms());
  }

  async removeFromPublicLobbyIndex(roomId: string): Promise<void> {
    await this.redis.srem(redisKeys.publicLobbyRooms(), roomId);
  }

  async load(roomId: string): Promise<LiveRoomState | null> {
    const raw = await this.redis.get(redisKeys.liveRoom(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as LiveRoomState;
  }

  async findRoomIdByCode(code: string): Promise<string | null> {
    return this.redis.get(redisKeys.roomByCode(code.toUpperCase()));
  }
}
