import type express from "express";
import { z } from "zod";
import type { UserService } from "../../../application/userService.js";
import { isValidIranianMobile, normalizeIranianPhone } from "../../../shared/phone.js";

const phoneSchema = z
  .string()
  .min(11)
  .max(18)
  .transform(normalizeIranianPhone)
  .refine(isValidIranianMobile, "شماره موبایل باید ۱۱ رقم و با 09 شروع شود");

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

const platformLoginBody = z.object({
  provider: z.enum(["bale_bot", "telegram_mini_app"]),
  phone: phoneSchema,
  displayName: z.string().min(1).max(32).optional(),
  avatar: z.string().min(1).max(128).optional(),
  platformUserId: z.string().min(1).max(128).optional(),
  initData: z.string().max(4096).optional(),
});

export class AuthController {
  constructor(private readonly users: UserService) {}

  register: express.RequestHandler = async (req, res) => {
    const body = registerBody.parse(req.body);
    const out = await this.users.register(body.phone, body.password, body.displayName, body.avatar);
    res.status(201).json(out);
  };

  login: express.RequestHandler = async (req, res) => {
    const body = loginBody.parse(req.body);
    const out = await this.users.login(body.phone, body.password);
    res.status(200).json(out);
  };

  platformLogin: express.RequestHandler = async (req, res) => {
    const body = platformLoginBody.parse(req.body);
    const out = await this.users.platformLogin({
      provider: body.provider,
      phone: body.phone,
      displayName: body.displayName,
      avatar: body.avatar,
      platformUserId: body.platformUserId,
      initData: body.initData,
    });
    res.status(200).json(out);
  };
}
