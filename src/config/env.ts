import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PLAYER_TOKEN_TTL_SEC: z.coerce.number().default(86_400),
  JWT_SECRET: z.string().min(16),
  BALE_BOT_TOKEN: z.string().optional().default(""),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  JWT_EXPIRES_IN_SEC: z.coerce.number().default(604_800),
  BCRYPT_COST: z.coerce.number().min(10).max(14).default(11),
  ADMIN_USERNAME: z.string().min(1).max(64).default("admin"),
  ADMIN_PASSWORD: z.string().min(1).max(128).default("admin"),
  ADMIN_NAME: z.string().min(1).max(64).default("مدیر سیستم"),
});

export type AppEnv = z.infer<typeof schema>;

export function loadEnv(): AppEnv {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment: ${JSON.stringify(msg)}`);
  }
  return parsed.data;
}
