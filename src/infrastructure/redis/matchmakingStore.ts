import type { Redis } from "ioredis";
import { redisKeys } from "./keys.js";

export type MatchmakingEntry = {
  roomId: string;
  code: string;
  hostPlayerToken: string;
  createdAt: number;
};

export class MatchmakingStore {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<MatchmakingEntry | null> {
    const value = await this.redis.get(redisKeys.matchmakingQueue(key));
    return value ? (JSON.parse(value) as MatchmakingEntry) : null;
  }

  async save(key: string, entry: MatchmakingEntry, ttlMs: number): Promise<void> {
    await this.redis.set(
      redisKeys.matchmakingQueue(key),
      JSON.stringify(entry),
      "PX",
      ttlMs,
    );
  }

  async remove(key: string): Promise<void> {
    await this.redis.del(redisKeys.matchmakingQueue(key));
  }

  async acquireLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    const result = await this.redis.set(
      redisKeys.matchmakingLock(key),
      token,
      "PX",
      ttlMs,
      "NX",
    );
    return result === "OK";
  }

  async releaseLock(key: string, token: string): Promise<void> {
    await this.redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then
         return redis.call("del", KEYS[1])
       end
       return 0`,
      1,
      redisKeys.matchmakingLock(key),
      token,
    );
  }
}
