import mongoose, { Schema } from "mongoose";

export type UserDoc = {
  _id: mongoose.Types.ObjectId;
  phone: string;
  username?: string;
  baleUserId?: string;
  baleLinkedAt?: Date;
  telegramUserId?: string;
  telegramLinkedAt?: Date;
  passwordHash: string;
  displayName: string;
  avatar: string;
  isBot: boolean;
  botProfile?: UserBotProfile;
  xp: number;
  level: number;
  coins: number;
  wins: number;
  gamesPlayed: number;
  winStreak: number;
  bestWinStreak: number;
  dailyWinStreak: number;
  bestDailyWinStreak: number;
  lastDailyWinDayKey?: string;
  accuracyPct: number;
  gameStats?: Record<string, UserGameStats>;
  createdAt: Date;
  updatedAt: Date;
};

export type UserGameStats = {
  xp: number;
  wins: number;
  gamesPlayed: number;
};

export type UserBotProfile = {
  key: string;
  difficulty?: "easy" | "normal" | "hard" | string;
};

const botProfileSchema = new Schema<UserBotProfile>(
  {
    key: { type: String, required: true, trim: true },
    difficulty: { type: String, required: false, trim: true },
  },
  { _id: false },
);

const gameStatsSchema = new Schema<UserGameStats>(
  {
    xp: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },
  },
  { _id: false },
);

const userSchema = new Schema<UserDoc>(
  {
    phone: { type: String, required: true, unique: true, trim: true, index: true },
    username: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
    baleUserId: { type: String, unique: true, sparse: true, trim: true, index: true },
    baleLinkedAt: { type: Date, required: false },
    telegramUserId: { type: String, unique: true, sparse: true, trim: true, index: true },
    telegramLinkedAt: { type: Date, required: false },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true },
    avatar: { type: String, required: true, default: "/assets/avatars/avatar_1.png" },
    isBot: { type: Boolean, required: true, default: false, index: true },
    botProfile: { type: botProfileSchema, required: false },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    coins: { type: Number, default: 100 },
    wins: { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },
    winStreak: { type: Number, default: 0 },
    bestWinStreak: { type: Number, default: 0 },
    dailyWinStreak: { type: Number, default: 0 },
    bestDailyWinStreak: { type: Number, default: 0 },
    lastDailyWinDayKey: { type: String, required: false, trim: true },
    accuracyPct: { type: Number, default: 0 },
    gameStats: { type: Map, of: gameStatsSchema, default: {} },
  },
  { timestamps: true },
);

export const UserModel = mongoose.model<UserDoc>("User", userSchema);
