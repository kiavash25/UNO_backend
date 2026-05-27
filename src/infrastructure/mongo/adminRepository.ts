import type { AdminDoc, AdminRole } from "./models/adminModel.js";
import { AdminModel } from "./models/adminModel.js";

export class AdminRepository {
  async prepareIndexes(): Promise<void> {
    await AdminModel.createIndexes();
  }

  async count(): Promise<number> {
    return AdminModel.countDocuments({}).exec();
  }

  async create(data: {
    username: string;
    passwordHash: string;
    name: string;
    role: AdminRole;
    avatar: string;
  }): Promise<AdminDoc> {
    const created = await AdminModel.create(data);
    const admin = await AdminModel.findById(created._id).lean<AdminDoc>().exec();
    if (!admin) throw new Error("admin persist failed");
    return admin;
  }

  async findForLogin(username: string): Promise<(AdminDoc & { passwordHash: string }) | null> {
    return AdminModel.findOne({ username: username.trim().toLowerCase(), isActive: true })
      .select("+passwordHash")
      .lean<AdminDoc & { passwordHash: string }>()
      .exec();
  }

  async touchLastLogin(id: string): Promise<void> {
    await AdminModel.findByIdAndUpdate(id, { $set: { lastLoginAt: new Date() } }).exec();
  }
}
