import type express from "express";
import { z } from "zod";
import type { UserService } from "../../../application/userService.js";

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
}

