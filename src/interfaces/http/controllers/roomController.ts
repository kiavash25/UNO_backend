import type express from "express";
import { z } from "zod";
import { AppError } from "../../../application/errors.js";
import type { RoomService } from "../../../application/roomService.js";

const createRoomBody = z.object({
  gameId: z.string().min(1).max(32).optional(),
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
  gameId: z.string().min(1).max(32).optional(),
  displayName: z.string().min(1).max(32),
  avatar: z.string().min(1).max(128).optional(),
});

const botMatchBody = z.object({
  gameId: z.string().min(1).max(32).optional(),
  displayName: z.string().min(1).max(32),
  avatar: z.string().min(1).max(128).optional(),
  totalPlayers: z.number().int().min(2).max(4),
});

export class RoomController {
  constructor(private readonly rooms: RoomService) {}

  create: express.RequestHandler = async (req, res) => {
    const body = createRoomBody.parse(req.body);
    const result = await this.rooms.createRoom(body.hostDisplayName, body.avatar, {
      gameId: body.gameId,
      name: body.name,
      maxPlayers: body.maxPlayers,
      mode: body.mode,
      isPrivate: body.isPrivate,
    });
    res.status(201).json(result);
  };

  join: express.RequestHandler = async (req, res) => {
    const body = joinBody.parse(req.body);
    const result = await this.rooms.joinRoom(body.code, body.displayName, body.avatar);
    res.status(200).json(result);
  };

  listPublic: express.RequestHandler = async (_req, res) => {
    const rooms = await this.rooms.listPublicRooms();
    res.json({ rooms });
  };

  quickPlay: express.RequestHandler = async (req, res) => {
    const body = quickPlayBody.parse(req.body);
    const result = await this.rooms.quickPlay(body.displayName, body.avatar, body.gameId);
    res.status(result.created ? 201 : 200).json(result);
  };

  createBotMatch: express.RequestHandler = async (req, res) => {
    const body = botMatchBody.parse(req.body);
    const result = await this.rooms.createBotMatch(body.displayName, body.totalPlayers, body.avatar, body.gameId);
    res.status(201).json(result);
  };

  getByCode: express.RequestHandler = async (req, res) => {
    const code = req.params.code?.toUpperCase() ?? "";
    if (code.length !== 4) throw new AppError("کد اتاق نامعتبر است", "bad_code", 400);

    const info = await this.rooms.getPublicByCode(code);
    if (!info) throw new AppError("اتاق پیدا نشد", "not_found", 404);
    res.json(info);
  };
}

