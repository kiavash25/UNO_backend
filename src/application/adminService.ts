import bcrypt from "bcryptjs";
import type { JwtService } from "../infrastructure/auth/jwt.js";
import type { AdminDoc, AdminRole } from "../infrastructure/mongo/models/adminModel.js";
import { AdminRepository } from "../infrastructure/mongo/adminRepository.js";
import { AppError } from "./errors.js";

export type PublicAdmin = {
  id: string;
  username: string;
  name: string;
  role: AdminRole;
  avatar: string;
};

export class AdminService {
  constructor(
    private readonly admins: AdminRepository,
    private readonly jwt: JwtService,
    private readonly bcryptCost: number,
  ) {}

  private toPublic(admin: AdminDoc): PublicAdmin {
    return {
      id: String(admin._id),
      username: admin.username,
      name: admin.name,
      role: admin.role,
      avatar: admin.avatar,
    };
  }

  async ensureDefaultAdmin(input: {
    username: string;
    password: string;
    name: string;
    role: AdminRole;
    avatar: string;
  }): Promise<void> {
    if ((await this.admins.count()) > 0) return;

    const passwordHash = await bcrypt.hash(input.password, this.bcryptCost);
    await this.admins.create({
      username: input.username.trim().toLowerCase(),
      passwordHash,
      name: input.name.trim(),
      role: input.role,
      avatar: input.avatar,
    });
  }

  async login(username: string, password: string): Promise<{ token: string; admin: PublicAdmin }> {
    const admin = await this.admins.findForLogin(username);
    if (!admin) throw new AppError("نام کاربری یا رمز عبور اشتباه است", "invalid_admin_credentials", 401);

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) throw new AppError("نام کاربری یا رمز عبور اشتباه است", "invalid_admin_credentials", 401);

    await this.admins.touchLastLogin(String(admin._id));
    const token = await this.jwt.signAccessToken(String(admin._id), admin.username);
    return { token, admin: this.toPublic(admin) };
  }
}
