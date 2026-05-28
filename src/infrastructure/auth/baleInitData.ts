import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../../application/errors.js";

export type BaleInitUser = {
  id: number;
  first_name?: string;
  username?: string;
  allows_write_to_pm?: boolean;
};

export type WebAppInitUser = BaleInitUser;

export type VerifiedWebAppInitData = {
  authDate?: number;
  queryId?: string;
  user: WebAppInitUser;
};

export type VerifiedBaleInitData = VerifiedWebAppInitData;
export type VerifiedTelegramInitData = VerifiedWebAppInitData;

function verifyWebAppInitData(initData: string, botToken: string, provider: "bale" | "telegram"): VerifiedWebAppInitData {
  if (!botToken) {
    throw new AppError(
      provider === "bale" ? "توکن بله تنظیم نشده است" : "توکن تلگرام تنظیم نشده است",
      provider === "bale" ? "bale_not_configured" : "telegram_not_configured",
      500,
    );
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new AppError(
      provider === "bale" ? "داده بله نامعتبر است" : "داده تلگرام نامعتبر است",
      provider === "bale" ? "bad_bale_init_data" : "bad_telegram_init_data",
      401,
    );
  }

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(computed, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new AppError(
      provider === "bale" ? "امضای بله نامعتبر است" : "امضای تلگرام نامعتبر است",
      provider === "bale" ? "bad_bale_signature" : "bad_telegram_signature",
      401,
    );
  }

  const rawUser = params.get("user");
  if (!rawUser) {
    throw new AppError(
      provider === "bale" ? "کاربر بله پیدا نشد" : "کاربر تلگرام پیدا نشد",
      provider === "bale" ? "missing_bale_user" : "missing_telegram_user",
      401,
    );
  }

  const parsedUser: unknown = JSON.parse(rawUser);
  if (
    typeof parsedUser !== "object" ||
    parsedUser === null ||
    !("id" in parsedUser) ||
    typeof (parsedUser as { id: unknown }).id !== "number"
  ) {
    throw new AppError(
      provider === "bale" ? "کاربر بله نامعتبر است" : "کاربر تلگرام نامعتبر است",
      provider === "bale" ? "bad_bale_user" : "bad_telegram_user",
      401,
    );
  }

  return {
    authDate: Number(params.get("auth_date") ?? undefined) || undefined,
    queryId: params.get("query_id") ?? undefined,
    user: parsedUser as WebAppInitUser,
  };
}

export function verifyBaleInitData(initData: string, botToken: string): VerifiedBaleInitData {
  return verifyWebAppInitData(initData, botToken, "bale");
}

export function verifyTelegramInitData(initData: string, botToken: string): VerifiedTelegramInitData {
  return verifyWebAppInitData(initData, botToken, "telegram");
}
