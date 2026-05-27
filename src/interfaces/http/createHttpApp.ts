import cors from "cors";
import express from "express";
import path from "node:path";
import type { FeedbackService } from "../../application/feedbackService.js";
import { RoomService } from "../../application/roomService.js";
import type { UserService } from "../../application/userService.js";
import { handleHttpError } from "./errorMiddleware.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createAvatarRouter } from "./routes/avatarRoutes.js";
import { createBotRouter } from "./routes/botRoutes.js";
import { createFeedbackRouter } from "./routes/feedbackRoutes.js";
import { createGameRouter } from "./routes/gameRoutes.js";
import { createRoomRouter } from "./routes/roomRoutes.js";
import { createUserRouter } from "./routes/userRoutes.js";

export type HttpAppDeps = {
  feedbackService: FeedbackService;
  roomService: RoomService;
  userService: UserService;
};

export function createHttpApp(deps: HttpAppDeps) {
  const { feedbackService, roomService, userService } = deps;
  const app = express();

  app.use(cors({ origin: true, methods: ["GET", "POST", "PATCH", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
  app.use(express.json());
  app.use(
    "/assets/avatars",
    express.static(path.resolve(process.cwd(), "public", "avatars"), {
      immutable: true,
      maxAge: "30d",
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", createAuthRouter(userService));
  app.use("/api/avatars", createAvatarRouter());
  app.use("/api/feedback", createFeedbackRouter(feedbackService, userService));
  app.use("/api", createUserRouter(userService, roomService));
  app.use("/api/bots", createBotRouter());
  app.use("/api/games", createGameRouter());
  app.use("/api/rooms", createRoomRouter(roomService, userService));
  app.use(handleHttpError);

  return app;
}
