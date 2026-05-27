import type { UserDoc } from "./models/userModel.js";
import { UserModel } from "./models/userModel.js";
import type { SortOrder } from "mongoose";

export type UserPatch = Partial<
  Pick<
    UserDoc,
    | "displayName"
    | "username"
    | "avatar"
    | "isBot"
    | "botProfile"
    | "xp"
    | "level"
    | "coins"
    | "wins"
    | "gamesPlayed"
    | "winStreak"
    | "bestWinStreak"
    | "accuracyPct"
    | "gameStats"
    | "passwordHash"
  >
>;

export type LeaderboardScope = "overall" | "uno";

export type LeaderboardUser = Pick<
  UserDoc,
  "_id" | "displayName" | "avatar" | "xp" | "wins" | "gamesPlayed" | "accuracyPct" | "gameStats"
>;

export class UserRepository {
  async prepareIndexes(): Promise<void> {
    await UserModel.collection.dropIndex("email_1").catch((err: unknown) => {
      const codeName = typeof err === "object" && err !== null && "codeName" in err ? String(err.codeName) : "";
      if (codeName !== "IndexNotFound") throw err;
    });
    await UserModel.createIndexes();
  }

  async create(data: {
    phone: string;
    username?: string;
    passwordHash: string;
    displayName: string;
    avatar: string;
    isBot?: boolean;
    botProfile?: UserDoc["botProfile"];
  }): Promise<UserDoc> {
    const created = await UserModel.create(data);
    const u = await UserModel.findById(created._id).lean<UserDoc>().exec();
    if (!u) throw new Error("user persist failed");
    return u;
  }

  async findByPhone(phone: string): Promise<UserDoc | null> {
    return UserModel.findOne({ phone: phone.trim() }).lean<UserDoc>().exec();
  }

  async findForLogin(phone: string): Promise<(UserDoc & { passwordHash: string }) | null> {
    return UserModel.findOne({ phone: phone.trim() })
      .select("+passwordHash")
      .lean<UserDoc & { passwordHash: string }>()
      .exec();
  }

  async findForLoginById(id: string): Promise<(UserDoc & { passwordHash: string }) | null> {
    return UserModel.findById(id)
      .select("+passwordHash")
      .lean<UserDoc & { passwordHash: string }>()
      .exec();
  }

  async findById(id: string): Promise<UserDoc | null> {
    return UserModel.findById(id).lean<UserDoc>().exec();
  }

  async updateById(id: string, patch: UserPatch): Promise<UserDoc | null> {
    return UserModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean<UserDoc>().exec();
  }

  async leaderboard(scope: LeaderboardScope, limit: number): Promise<LeaderboardUser[]> {
    const sort: Record<string, SortOrder> =
      scope === "overall" ? { xp: -1, wins: -1 } : { "gameStats.uno.xp": -1, "gameStats.uno.wins": -1 };
    return UserModel.find({})
      .select("_id displayName avatar xp wins gamesPlayed accuracyPct gameStats")
      .sort(sort)
      .limit(limit)
      .lean<LeaderboardUser[]>()
      .exec();
  }
}
