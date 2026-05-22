import cors from "cors";
import express from "express";
import { RoomService } from "../../application/roomService.js";
import type { UserService } from "../../application/userService.js";
import { handleHttpError } from "./errorMiddleware.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createGameRouter } from "./routes/gameRoutes.js";
import { createRoomRouter } from "./routes/roomRoutes.js";
import { createUserRouter } from "./routes/userRoutes.js";

export type HttpAppDeps = {
  roomService: RoomService;
  userService: UserService;
};

export function createHttpApp(deps: HttpAppDeps) {
  const { roomService, userService } = deps;
  const app = express();

  app.use(cors({ origin: true, methods: ["GET", "POST", "PATCH", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", createAuthRouter(userService));
  app.use("/api", createUserRouter(userService));
  app.use("/api/games", createGameRouter());
  app.use("/api/rooms", createRoomRouter(roomService));
  app.use(handleHttpError);

  return app;
}

