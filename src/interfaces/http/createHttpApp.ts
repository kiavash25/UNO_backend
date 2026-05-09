import cors from "cors";
import express from "express";
import { z } from "zod";
import { AppError } from "../../application/errors.js";
import { RoomService } from "../../application/roomService.js";
import type { UserService } from "../../application/userService.js";
import { bearerAuth } from "./authMiddleware.js";

const createRoomBody = z.object({
  hostDisplayName: z.string().min(1).max(32),
  name: z.string().min(1).max(64),
  maxPlayers: z.number().int().min(2).max(10).optional(),
  mode: z.enum(["classic", "fast"]).optional(),
  isPrivate: z.boolean().optional(),
});

const joinBody = z.object({
  code: z
    .string()
    .length(4)
    .transform((s) => s.toUpperCase()),
  displayName: z.string().min(1).max(32),
});

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(32),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const patchMeBody = z.object({
  displayName: z.string().min(1).max(32).optional(),
  avatar: z.string().min(1).max(8).optional(),
});

const matchBody = z.object({
  won: z.boolean(),
});

export type HttpAppDeps = {
  roomService: RoomService;
  userService: UserService;
};

function handleError(res: express.Response, e: unknown) {
  if (e instanceof z.ZodError) {
    res.status(400).json({ error: "validation", details: e.flatten() });
    return;
  }
  if (e instanceof AppError) {
    res.status(e.status).json({ error: e.code, message: e.message });
    return;
  }
  console.error(e);
  res.status(500).json({ error: "internal" });
}

export function createHttpApp(deps: HttpAppDeps) {
  const { roomService, userService } = deps;
  const app = express();
  app.use(cors());
  app.use(express.json());

  const auth = bearerAuth(userService);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const body = registerBody.parse(req.body);
      const out = await userService.register(body.email, body.password, body.displayName);
      res.status(201).json(out);
    } catch (e) {
      handleError(res, e);
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const body = loginBody.parse(req.body);
      const out = await userService.login(body.email, body.password);
      res.status(200).json(out);
    } catch (e) {
      handleError(res, e);
    }
  });

  app.get("/api/me", auth, async (req, res) => {
    try {
      const u = await userService.getProfile(req.authed!.userId);
      res.json(u);
    } catch (e) {
      handleError(res, e);
    }
  });

  app.patch("/api/me", auth, async (req, res) => {
    try {
      const body = patchMeBody.parse(req.body);
      const u = await userService.updateProfile(req.authed!.userId, body);
      res.json(u);
    } catch (e) {
      handleError(res, e);
    }
  });

  app.post("/api/me/match", auth, async (req, res) => {
    try {
      const body = matchBody.parse(req.body);
      const u = await userService.recordMatch(req.authed!.userId, body.won);
      res.json(u);
    } catch (e) {
      handleError(res, e);
    }
  });

  app.post("/api/rooms", async (req, res) => {
    try {
      const body = createRoomBody.parse(req.body);
      const result = await roomService.createRoom(body.hostDisplayName, {
        name: body.name,
        maxPlayers: body.maxPlayers,
        mode: body.mode,
        isPrivate: body.isPrivate,
      });
      res.status(201).json(result);
    } catch (e) {
      handleError(res, e);
    }
  });

  app.post("/api/rooms/join", async (req, res) => {
    try {
      const body = joinBody.parse(req.body);
      const result = await roomService.joinRoom(body.code, body.displayName);
      res.status(200).json(result);
    } catch (e) {
      handleError(res, e);
    }
  });

  app.get("/api/rooms/:code", async (req, res) => {
    try {
      const code = req.params.code?.toUpperCase() ?? "";
      if (code.length !== 4) {
        res.status(400).json({ error: "bad_code" });
        return;
      }
      const info = await roomService.getPublicByCode(code);
      if (!info) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(info);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "internal" });
    }
  });

  return app;
}
