import http from "http";
import { FeedbackService } from "./application/feedbackService.js";
import { RoomService } from "./application/roomService.js";
import { UserService } from "./application/userService.js";
import { loadEnv } from "./config/env.js";
import { createJwtService } from "./infrastructure/auth/jwt.js";
import { connectMongo, disconnectMongo } from "./infrastructure/mongo/connection.js";
import { FeedbackRepository } from "./infrastructure/mongo/feedbackRepository.js";
import { RoomRepository } from "./infrastructure/mongo/roomRepository.js";
import { UserRepository } from "./infrastructure/mongo/userRepository.js";
import { LiveRoomStore } from "./infrastructure/redis/liveRoomStore.js";
import { createRedis } from "./infrastructure/redis/redisClient.js";
import { SessionStore } from "./infrastructure/redis/sessionStore.js";
import { createHttpApp } from "./interfaces/http/createHttpApp.js";
import { attachWsServer } from "./interfaces/ws/attachWsServer.js";
import { WsHub } from "./interfaces/ws/wsHub.js";

async function main() {
  const env = loadEnv();
  await connectMongo(env.MONGODB_URI);

  const redis = createRedis(env.REDIS_URL);
  const roomRepo = new RoomRepository();
  const live = new LiveRoomStore(redis);
  const sessions = new SessionStore(redis, env.PLAYER_TOKEN_TTL_SEC);

  const hubRef: { hub?: WsHub } = {};
  const roomService = new RoomService(roomRepo, live, sessions, {
    onRoomChanged: (roomId) => hubRef.hub?.pushRoom(roomId),
    onGameEvent: (roomId, event) => {
      if (event.type === "uno.declared") return;
      hubRef.hub?.broadcastEvent(roomId, {
        type: event.type,
        ...(event.payload ?? {}),
        ts: Date.now(),
      });
    },
    onUnoDeclared: (roomId, playerId, displayName) => {
      hubRef.hub?.broadcastEvent(roomId, {
        type: "game.unoDeclared",
        playerId,
        displayName,
        ts: Date.now(),
      });
    },
    onRoomDestroyed: (roomId) => {
      hubRef.hub?.closeRoom(roomId);
    },
  });
  hubRef.hub = new WsHub(roomService);

  const jwt = createJwtService(env.JWT_SECRET, env.JWT_EXPIRES_IN_SEC);
  const feedbackRepo = new FeedbackRepository();
  const userRepo = new UserRepository();
  await userRepo.prepareIndexes();
  const feedbackService = new FeedbackService(feedbackRepo);
  const userService = new UserService(userRepo, jwt, env.BCRYPT_COST);

  const app = createHttpApp({ feedbackService, roomService, userService });
  const server = http.createServer(app);
  attachWsServer({ server, roomService, hub: hubRef.hub });

  server.listen(env.PORT, () => {
    console.log(`Cardix API + WS روی پورت ${env.PORT} (مسیر WS: /ws)`);
  });

  const shutdown = async () => {
    server.close();
    redis.disconnect();
    await disconnectMongo();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
