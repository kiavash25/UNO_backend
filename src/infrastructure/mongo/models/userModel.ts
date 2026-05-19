import mongoose, { Schema } from "mongoose";

export type UserDoc = {
  _id: mongoose.Types.ObjectId;
  phone: string;
  passwordHash: string;
  displayName: string;
  avatar: string;
  xp: number;
  level: number;
  coins: number;
  wins: number;
  gamesPlayed: number;
  winStreak: number;
  bestWinStreak: number;
  accuracyPct: number;
  createdAt: Date;
  updatedAt: Date;
};

const userSchema = new Schema<UserDoc>(
  {
    phone: { type: String, required: true, unique: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true },
    avatar: { type: String, required: true, default: "🦊" },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    coins: { type: Number, default: 100 },
    wins: { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },
    winStreak: { type: Number, default: 0 },
    bestWinStreak: { type: Number, default: 0 },
    accuracyPct: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const UserModel = mongoose.model<UserDoc>("User", userSchema);
