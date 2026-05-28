import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../../application/errors.js";

export type BaleInitUser = {
  id: number;
  first_name?: string;
  username?: string;
  allows_write_to_pm?: boolean;
};

export type VerifiedBaleInitData = {
  authDate?: number;
  queryId?: string;
  user: BaleInitUser;
};

export function verifyBaleInitData(initData: string, botToken: string): VerifiedBaleInitData {
  if (!botToken) throw new AppError("توکن بله تنظیم نشده است", "bale_not_configured", 500);

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new AppError("داده بله نامعتبر است", "bad_bale_init_data", 401);

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
    throw new AppError("امضای بله نامعتبر است", "bad_bale_signature", 401);
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new AppError("کاربر بله پیدا نشد", "missing_bale_user", 401);

  const parsedUser: unknown = JSON.parse(rawUser);
  if (
    typeof parsedUser !== "object" ||
    parsedUser === null ||
    !("id" in parsedUser) ||
    typeof (parsedUser as { id: unknown }).id !== "number"
  ) {
    throw new AppError("کاربر بله نامعتبر است", "bad_bale_user", 401);
  }

  return {
    authDate: Number(params.get("auth_date") ?? undefined) || undefined,
    queryId: params.get("query_id") ?? undefined,
    user: parsedUser as BaleInitUser,
  };
}
