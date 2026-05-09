import type { UserDoc } from "./models/userModel.js";
import { UserModel } from "./models/userModel.js";

export type UserPatch = Partial<
  Pick<
    UserDoc,
    | "displayName"
    | "avatar"
    | "xp"
    | "level"
    | "coins"
    | "wins"
    | "gamesPlayed"
    | "winStreak"
    | "bestWinStreak"
    | "accuracyPct"
  >
>;

export class UserRepository {
  async create(data: {
    email: string;
    passwordHash: string;
    displayName: string;
    avatar: string;
  }): Promise<UserDoc> {
    const created = await UserModel.create(data);
    const u = await UserModel.findById(created._id).lean<UserDoc>().exec();
    if (!u) throw new Error("user persist failed");
    return u;
  }

  async findByEmail(email: string): Promise<UserDoc | null> {
    return UserModel.findOne({ email: email.toLowerCase().trim() }).lean<UserDoc>().exec();
  }

  async findForLogin(email: string): Promise<(UserDoc & { passwordHash: string }) | null> {
    return UserModel.findOne({ email: email.toLowerCase().trim() })
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
}
