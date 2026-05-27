import type express from "express";
import { z } from "zod";
import type { AdminService } from "../../../application/adminService.js";

const adminLoginBody = z.object({
  username: z.string().min(1).max(64).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});

export class AdminAuthController {
  constructor(private readonly admins: AdminService) {}

  login: express.RequestHandler = async (req, res) => {
    const body = adminLoginBody.parse(req.body);
    const out = await this.admins.login(body.username, body.password);
    res.status(200).json(out);
  };
}
