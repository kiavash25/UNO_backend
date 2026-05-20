import cors from "cors";
import express from "express";
import { z } from "zod";
import { AppError } from "../../application/errors.js";
import { RoomService } from "../../application/roomService.js";
import type { UserService } from "../../application/userService.js";
import { bearerAuth } from "./authMiddleware.js";

const createRoomBody = z.object({
  hostDisplayName: z.string().min(1).max(32),
  avatar: z.string().min(1).max(128).optional(),
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
  avatar: z.string().min(1).max(128).optional(),
});

const quickPlayBody = z.object({
  displayName: z.string().min(1).max(32),
  avatar: z.string().min(1).max(128).optional(),
});

const botMatchBody = z.object({
  displayName: z.string().min(1).max(32),
  avatar: z.string().min(1).max(128).optional(),
  totalPlayers: z.number().int().min(2).max(4),
});

function normalizePhone(raw: string): string {
  const englishDigits = raw
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const compact = englishDigits.replace(/[\s\-().]/g, "");
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (compact.startsWith("09")) return `+98${compact.slice(1)}`;
  if (compact.startsWith("98")) return `+${compact}`;
  return compact;
}

const phoneSchema = z
  .string()
  .min(8)
  .max(24)
  .transform(normalizePhone)
  .refine((phone) => /^\+[1-9]\d{7,14}$/.test(phone), "شماره تلفن نامعتبر است");

const registerBody = z.object({
  phone: phoneSchema,
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(32),
  avatar: z.string().min(1).max(128).optional(),
});

const loginBody = z.object({
  phone: phoneSchema,
  password: z.string().min(1).max(128),
});

const patchMeBody = z.object({
  displayName: z.string().min(1).max(32).optional(),
  avatar: z.string().min(1).max(128).optional(),
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(128),
  nextPassword: z.string().min(8).max(128),
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
  app.use(cors({ origin: true, methods: ["GET", "POST", "PATCH", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
  app.use(express.json());

  const auth = bearerAuth(userService);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const body = registerBody.parse(req.body);
      const out = await userService.register(body.phone, body.password, body.displayName, body.avatar);
      res.status(201).json(out);
    } catch (e) {
      handleError(res, e);
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const body = loginBody.parse(req.body);
      const out = await userService.login(body.phone, body.password);
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

  app.patch("/api/me/password", auth, async (req, res) => {
    try {
      const body = changePasswordBody.parse(req.body);
      await userService.changePassword(req.authed!.userId, body.currentPassword, body.nextPassword);
      res.json({ ok: true });
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
      const result = await roomService.createRoom(body.hostDisplayName, body.avatar, {
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
      const result = await roomService.joinRoom(body.code, body.displayName, body.avatar);
      res.status(200).json(result);
    } catch (e) {
      handleError(res, e);
    }
  });

  app.get("/api/rooms/public", async (_req, res) => {
    try {
      const rooms = await roomService.listPublicRooms();
      res.json({ rooms });
    } catch (e) {
      handleError(res, e);
    }
  });

  app.post("/api/rooms/quick", async (req, res) => {
    try {
      const body = quickPlayBody.parse(req.body);
      const result = await roomService.quickPlay(body.displayName, body.avatar);
      res.status(result.created ? 201 : 200).json(result);
    } catch (e) {
      handleError(res, e);
    }
  });

  app.post("/api/rooms/bot-match", async (req, res) => {
    try {
      const body = botMatchBody.parse(req.body);
      const result = await roomService.createBotMatch(body.displayName, body.totalPlayers, body.avatar);
      res.status(201).json(result);
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
