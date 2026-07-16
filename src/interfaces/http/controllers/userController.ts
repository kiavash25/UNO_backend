import type express from "express";
import { z } from "zod";
import type { UserService } from "../../../application/userService.js";

const patchMeBody = z.object({
  displayName: z.string().min(1).max(32).optional(),
  avatar: z.string().min(1).max(128).optional(),
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(128),
  nextPassword: z.string().min(8).max(128),
});

const leaderboardParams = z.object({
  scope: z.enum(["overall", "uno"]),
});

const leaderboardQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export class UserController {
  constructor(private readonly users: UserService) {}

  me: express.RequestHandler = async (req, res) => {
    const user = await this.users.getProfile(req.authed!.userId);
    res.json(user);
  };

  updateMe: express.RequestHandler = async (req, res) => {
    const body = patchMeBody.parse(req.body);
    const user = await this.users.updateProfile(req.authed!.userId, body);
    res.json(user);
  };

  changePassword: express.RequestHandler = async (req, res) => {
    const body = changePasswordBody.parse(req.body);
    await this.users.changePassword(req.authed!.userId, body.currentPassword, body.nextPassword);
    res.json({ ok: true });
  };

  leaderboard: express.RequestHandler = async (req, res) => {
    const params = leaderboardParams.parse(req.params);
    const query = leaderboardQuery.parse(req.query);
    const leaderboard = await this.users.getLeaderboard(params.scope, query.limit);
    res.json(leaderboard);
  };
}
