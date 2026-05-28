import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import type { AdminService } from "../../application/adminService.js";
import type { FeedbackService } from "../../application/feedbackService.js";
import { RoomService } from "../../application/roomService.js";
import type { UserService } from "../../application/userService.js";
import { handleHttpError } from "./errorMiddleware.js";
import { createAdminAuthRouter } from "./routes/adminAuthRoutes.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createAvatarRouter } from "./routes/avatarRoutes.js";
import { createFeedbackRouter } from "./routes/feedbackRoutes.js";
import { createGameRouter } from "./routes/gameRoutes.js";
import { createRoomRouter } from "./routes/roomRoutes.js";
import { createUserRouter } from "./routes/userRoutes.js";

export type HttpAppDeps = {
  adminService: AdminService;
  feedbackService: FeedbackService;
  roomService: RoomService;
  userService: UserService;
};

export function createHttpApp(deps: HttpAppDeps) {
  const { adminService, feedbackService, roomService, userService } = deps;
  const app = express();
  const appUiPath = path.resolve(process.cwd(), "appUI");
  const appUiIndexPath = path.join(appUiPath, "index.html");

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

  app.use("/api/admin/auth", createAdminAuthRouter(adminService));
  app.use("/api/auth", createAuthRouter(userService));
  app.use("/api/avatars", createAvatarRouter());
  app.use("/api/feedback", createFeedbackRouter(feedbackService, userService));
  app.use("/api", createUserRouter(userService, roomService));
  app.use("/api/games", createGameRouter());
  app.use("/api/rooms", createRoomRouter(roomService, userService));

  app.use(express.static(appUiPath));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path === "/health" || req.path === "/ws") {
      next();
      return;
    }

    if (!existsSync(appUiIndexPath)) {
      res.status(404).json({ error: "Frontend build not found. Put your build files in UNO_Backend/appUI." });
      return;
    }

    res.sendFile(appUiIndexPath);
  });

  app.use(handleHttpError);

  return app;
}
