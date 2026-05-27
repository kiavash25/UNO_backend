import mongoose, { Schema } from "mongoose";

export type GameReportDoc = {
  _id: mongoose.Types.ObjectId;
  roomId: string;
  code: string;
  gameId: string;
  isPrivate: boolean;
  hostPlayerId: string;
  hostUserId?: string;
  createdAtMs: number;
  startedAtMs?: number;
  finishedAtMs?: number;
  durationMs?: number;
  players: unknown[];
  winnerId?: string | null;
  ranking: string[];
  rewards: unknown[];
  events: unknown[];
  gameReport?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const gameReportSchema = new Schema<GameReportDoc>(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    code: { type: String, required: true, index: true },
    gameId: { type: String, required: true, index: true },
    isPrivate: { type: Boolean, required: true, index: true },
    hostPlayerId: { type: String, required: true },
    hostUserId: { type: String },
    createdAtMs: { type: Number, required: true },
    startedAtMs: { type: Number },
    finishedAtMs: { type: Number },
    durationMs: { type: Number },
    players: { type: [Schema.Types.Mixed], default: [] },
    winnerId: { type: String, default: null },
    ranking: { type: [String], default: [] },
    rewards: { type: [Schema.Types.Mixed], default: [] },
    events: { type: [Schema.Types.Mixed], default: [] },
    gameReport: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export const GameReportModel = mongoose.model<GameReportDoc>("GameReport", gameReportSchema);
