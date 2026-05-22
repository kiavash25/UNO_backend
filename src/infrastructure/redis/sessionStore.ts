import type { Redis } from "ioredis";
import type { SessionPayload } from "../../application/session.js";
import { legacyUnoRedisKeys, redisKeys } from "./keys.js";

export class SessionStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSec: number,
  ) {}

  async save(token: string, payload: SessionPayload): Promise<void> {
    await this.redis.set(redisKeys.session(token), JSON.stringify(payload), "EX", this.ttlSec);
  }

  async get(token: string): Promise<SessionPayload | null> {
    const raw = await this.redis.get(redisKeys.session(token)) ?? await this.redis.get(legacyUnoRedisKeys.session(token));
    if (!raw) return null;
    return JSON.parse(raw) as SessionPayload;
  }
}
