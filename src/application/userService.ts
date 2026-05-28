import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { JwtService } from "../infrastructure/auth/jwt.js";
import type { UserDoc, UserGameStats } from "../infrastructure/mongo/models/userModel.js";
import { UserRepository } from "../infrastructure/mongo/userRepository.js";
import { AppError } from "./errors.js";
import { buildMatchRewardPatch } from "./matchRewardProgress.js";
import {
  isAllowedAvatar,
  rankTitleForLevel,
  xpProgress,
} from "./userProfile.js";
import { AVATAR_OPTIONS, normalizeAvatar } from "../constant/avatar.cons.js";
import { normalizeIranianPhone } from "../shared/phone.js";

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
  gameStats: Record<string, UserGameStats>;
  createdAt: Date;
};

export type MatchRewardContext = {
  won: boolean;
  gameId: string;
  rank: number;
  totalPlayers: number;
  isPrivate: boolean;
};

export type LeaderboardScope = "overall" | "uno";

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  avatar: string;
  xp: number;
  wins: number;
  gamesPlayed: number;
  accuracyPct: number;
};

export type Leaderboard = {
  scope: LeaderboardScope;
  entries: LeaderboardEntry[];
};

export type PlatformLoginProvider = "bale_bot" | "telegram_mini_app";

export type PlatformLoginInput = {
  provider: PlatformLoginProvider;
  phone: string;
  displayName?: string;
  avatar?: string;
  platformUserId?: string;
  initData?: string;
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

  private normalizeGameStats(gameStats: UserDoc["gameStats"]): Record<string, UserGameStats> {
    if (!gameStats) return {};
    if (gameStats instanceof Map) return Object.fromEntries(gameStats.entries());
    return gameStats;
  }

  private toPublic(user: UserDoc): PublicProfile {
    const { xpIntoLevel, xpForNextLevel, level } = xpProgress(user.xp);
    return {
      id: String(user._id),
      phone: normalizeIranianPhone(user.phone),
      displayName: user.displayName,
      avatar: normalizeAvatar(user.avatar),
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
      gameStats: this.normalizeGameStats(user.gameStats),
      createdAt: user.createdAt,
    };
  }

  async register(phone: string, password: string, displayName: string, avatarId?: string): Promise<{ token: string; user: PublicProfile }> {
    const exists = await this.users.findByPhone(phone);
    if (exists) throw new AppError("این شماره تلفن قبلاً ثبت شده است", "phone_taken", 409);
    if (avatarId !== undefined && !isAllowedAvatar(avatarId)) throw new AppError("آواتار نامعتبر است", "bad_avatar");

    const passwordHash = await bcrypt.hash(password, this.bcryptCost);
    const avatar = avatarId ? normalizeAvatar(avatarId) : AVATAR_OPTIONS[0]!;
    const doc = await this.users.create({
      phone: phone.trim(),
      passwordHash,
      displayName: displayName.trim(),
      avatar,
    });

    const token = await this.jwt.signAccessToken(String(doc._id), normalizeIranianPhone(doc.phone));
    return { token, user: this.toPublic(doc) };
  }

  async login(phone: string, password: string): Promise<{ token: string; user: PublicProfile }> {
    const doc = await this.users.findForLogin(phone);
    if (!doc) throw new AppError("شماره تلفن یا رمز اشتباه است", "invalid_credentials", 401);

    const ok = await bcrypt.compare(password, doc.passwordHash);
    if (!ok) throw new AppError("شماره تلفن یا رمز اشتباه است", "invalid_credentials", 401);

    const full = await this.users.findById(String(doc._id));
    if (!full) throw new AppError("کاربر پیدا نشد", "not_found", 404);

    const token = await this.jwt.signAccessToken(String(full._id), normalizeIranianPhone(full.phone));
    return { token, user: this.toPublic(full) };
  }

  async platformLogin(input: PlatformLoginInput): Promise<{ token: string; user: PublicProfile }> {
    const existing = await this.users.findByPhone(input.phone);
    if (existing) {
      const token = await this.jwt.signAccessToken(String(existing._id), normalizeIranianPhone(existing.phone));
      return { token, user: this.toPublic(existing) };
    }

    if (input.avatar !== undefined && !isAllowedAvatar(input.avatar)) throw new AppError("آواتار نامعتبر است", "bad_avatar");

    const displayName =
      input.displayName?.trim() ||
      (input.provider === "bale_bot" ? "بازیکن بله" : "بازیکن تلگرام");
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), this.bcryptCost);
    const avatar = input.avatar ? normalizeAvatar(input.avatar) : AVATAR_OPTIONS[0]!;
    const doc = await this.users.create({
      phone: input.phone.trim(),
      passwordHash,
      displayName: displayName.slice(0, 32),
      avatar,
    });

    const token = await this.jwt.signAccessToken(String(doc._id), normalizeIranianPhone(doc.phone));
    return { token, user: this.toPublic(doc) };
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
      update.avatar = normalizeAvatar(patch.avatar);
    }

    if (Object.keys(update).length === 0) return this.toPublic(u);

    const next = await this.users.updateById(userId, update);
    if (!next) throw new AppError("به‌روزرسانی ناموفق", "update_failed", 500);
    return this.toPublic(next);
  }

  async changePassword(userId: string, currentPassword: string, nextPassword: string): Promise<void> {
    if (nextPassword.length < 8 || nextPassword.length > 128) {
      throw new AppError("رمز عبور جدید باید حداقل ۸ کاراکتر باشد", "bad_password");
    }

    const doc = await this.users.findForLoginById(userId);
    if (!doc) throw new AppError("کاربر پیدا نشد", "not_found", 404);

    const ok = await bcrypt.compare(currentPassword, doc.passwordHash);
    if (!ok) throw new AppError("رمز عبور فعلی اشتباه است", "bad_current_password", 401);

    const passwordHash = await bcrypt.hash(nextPassword, this.bcryptCost);
    const updated = await this.users.updateById(userId, { passwordHash });
    if (!updated) throw new AppError("تغییر رمز عبور ناموفق بود", "update_failed", 500);
  }

  async recordMatch(userId: string, result: MatchRewardContext): Promise<PublicProfile> {
    const u = await this.users.findById(userId);
    if (!u) throw new AppError("کاربر پیدا نشد", "not_found", 404);

    const next = await this.users.updateById(userId, buildMatchRewardPatch(u, result));
    if (!next) throw new AppError("به‌روزرسانی ناموفق", "update_failed", 500);
    return this.toPublic(next);
  }

  async getLeaderboard(scope: LeaderboardScope, limit: number): Promise<Leaderboard> {
    const safeLimit = Math.max(1, Math.min(100, limit));
    const users = await this.users.leaderboard(scope, safeLimit);
    const entries = users.map((u, index) => {
      const gameStats = this.normalizeGameStats(u.gameStats);
      const unoStats = gameStats.uno ?? { xp: 0, wins: 0, gamesPlayed: 0 };
      const gamesPlayed = scope === "overall" ? u.gamesPlayed : unoStats.gamesPlayed;
      const wins = scope === "overall" ? u.wins : unoStats.wins;

      return {
        rank: index + 1,
        userId: String(u._id),
        displayName: u.displayName,
        avatar: normalizeAvatar(u.avatar),
        xp: scope === "overall" ? u.xp : unoStats.xp,
        wins,
        gamesPlayed,
        accuracyPct: gamesPlayed > 0 ? Math.min(100, Math.round((wins / gamesPlayed) * 100)) : 0,
      };
    });

    return { scope, entries };
  }
}
