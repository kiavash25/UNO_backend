import mongoose, { Schema } from "mongoose";

export type AdminRole = "owner" | "admin" | "moderator" | "support";

export type AdminDoc = {
  _id: mongoose.Types.ObjectId;
  username: string;
  passwordHash: string;
  name: string;
  role: AdminRole;
  avatar: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

const adminSchema = new Schema<AdminDoc>(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ["owner", "admin", "moderator", "support"], default: "admin", index: true },
    avatar: { type: String, required: true, default: "https://api.dicebear.com/9.x/adventurer/svg?seed=Admin" },
    isActive: { type: Boolean, default: true, index: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

export const AdminModel = mongoose.model<AdminDoc>("Admin", adminSchema);
