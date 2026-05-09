import type { Redis } from "ioredis";
import type { LiveRoomState } from "../../application/liveRoomState.js";
import { redisKeys } from "./keys.js";

export class LiveRoomStore {
  constructor(private readonly redis: Redis) {}

  async save(state: LiveRoomState): Promise<void> {
    const key = redisKeys.liveRoom(state.id);
    await this.redis.set(key, JSON.stringify(state));
    await this.redis.set(redisKeys.roomByCode(state.code), state.id);
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
