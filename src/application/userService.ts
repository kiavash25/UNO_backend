import bcrypt from "bcryptjs";
import type { JwtService } from "../infrastructure/auth/jwt.js";
import type { UserDoc } from "../infrastructure/mongo/models/userModel.js";
import { UserRepository } from "../infrastructure/mongo/userRepository.js";
import { AppError } from "./errors.js";
import {
  AVATAR_OPTIONS,
  isAllowedAvatar,
  levelFromXp,
  rankTitleForLevel,
  xpProgress,
} from "./userProfile.js";

export type PublicProfile = {
  id: string;
  phone: string;
  displayName: string;
  avatar: string;
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  rankTitle: string;
  coins: number;
  wins: number;
  gamesPlayed: number;
  winStreak: number;
  bestWinStreak: number;
  accuracyPct: number;
};

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly jwt: JwtService,
    private readonly bcryptCost: number,
  ) {}

  verifyAccessToken(token: string): Promise<{ userId: string; phone: string }> {
    return this.jwt.verifyAccessToken(token);
  }

  private toPublic(user: UserDoc): PublicProfile {
    const { xpIntoLevel, xpForNextLevel, level } = xpProgress(user.xp);
    return {
      id: String(user._id),
      phone: user.phone,
      displayName: user.displayName,
      avatar: user.avatar,
      xp: user.xp,
      level,
      xpIntoLevel,
      xpForNextLevel,
      rankTitle: rankTitleForLevel(level),
      coins: user.coins,
      wins: user.wins,
      gamesPlayed: user.gamesPlayed,
      winStreak: user.winStreak,
      bestWinStreak: user.bestWinStreak,
      accuracyPct: user.accuracyPct,
    };
  }

  async register(phone: string, password: string, displayName: string): Promise<{ token: string; user: PublicProfile }> {
    const exists = await this.users.findByPhone(phone);
    if (exists) throw new AppError("این شماره تلفن قبلاً ثبت شده است", "phone_taken", 409);

    const passwordHash = await bcrypt.hash(password, this.bcryptCost);
    const avatar = AVATAR_OPTIONS[0]!;
    const doc = await this.users.create({
      phone: phone.trim(),
      passwordHash,
      displayName: displayName.trim(),
      avatar,
    });

    const token = await this.jwt.signAccessToken(String(doc._id), doc.phone);
    return { token, user: this.toPublic(doc) };
  }

  async login(phone: string, password: string): Promise<{ token: string; user: PublicProfile }> {
    const doc = await this.users.findForLogin(phone);
    if (!doc) throw new AppError("شماره تلفن یا رمز اشتباه است", "invalid_credentials", 401);

    const ok = await bcrypt.compare(password, doc.passwordHash);
    if (!ok) throw new AppError("شماره تلفن یا رمز اشتباه است", "invalid_credentials", 401);

    const full = await this.users.findById(String(doc._id));
    if (!full) throw new AppError("کاربر پیدا نشد", "not_found", 404);

    const token = await this.jwt.signAccessToken(String(full._id), full.phone);
    return { token, user: this.toPublic(full) };
  }

  async getProfile(userId: string): Promise<PublicProfile> {
    const u = await this.users.findById(userId);
    if (!u) throw new AppError("کاربر پیدا نشد", "not_found", 404);
    return this.toPublic(u);
  }

  async updateProfile(userId: string, patch: { displayName?: string; avatar?: string }): Promise<PublicProfile> {
    const u = await this.users.findById(userId);
    if (!u) throw new AppError("کاربر پیدا نشد", "not_found", 404);

    const update: {
      displayName?: string;
      avatar?: string;
    } = {};
    if (patch.displayName !== undefined) {
      const d = patch.displayName.trim();
      if (d.length < 1 || d.length > 32) throw new AppError("نام نمایشی نامعتبر است", "bad_name");
      update.displayName = d;
    }
    if (patch.avatar !== undefined) {
      if (!isAllowedAvatar(patch.avatar)) throw new AppError("آواتار نامعتبر است", "bad_avatar");
      update.avatar = patch.avatar;
    }

    if (Object.keys(update).length === 0) return this.toPublic(u);

    const next = await this.users.updateById(userId, update);
    if (!next) throw new AppError("به‌روزرسانی ناموفق", "update_failed", 500);
    return this.toPublic(next);
  }

  async recordMatch(userId: string, won: boolean): Promise<PublicProfile> {
    const u = await this.users.findById(userId);
    if (!u) throw new AppError("کاربر پیدا نشد", "not_found", 404);

    const gamesPlayed = u.gamesPlayed + 1;
    const wins = won ? u.wins + 1 : u.wins;
    const xp = u.xp + (won ? 120 : 20);
    const coins = u.coins + (won ? 50 : 10);
    const winStreak = won ? u.winStreak + 1 : 0;
    const bestWinStreak = won ? Math.max(u.bestWinStreak, winStreak) : u.bestWinStreak;
    const level = levelFromXp(xp);
    const accuracyPct = Math.min(100, Math.round((wins / gamesPlayed) * 100));

    const next = await this.users.updateById(userId, {
      gamesPlayed,
      wins,
      xp,
      coins,
      winStreak,
      bestWinStreak,
      level,
      accuracyPct,
    });
    if (!next) throw new AppError("به‌روزرسانی ناموفق", "update_failed", 500);
    return this.toPublic(next);
  }
}
