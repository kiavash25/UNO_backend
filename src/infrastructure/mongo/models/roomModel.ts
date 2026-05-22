import mongoose, { Schema } from "mongoose";
import type { GameMode } from "../../../application/roomTypes.js";

export type RoomDoc = {
  _id: mongoose.Types.ObjectId;
  code: string;
  gameId: string;
  name: string;
  maxPlayers: number;
  mode: GameMode;
  isPrivate: boolean;
  turnTimeoutSec: number;
  hostPlayerId: string;
  createdAt: Date;
};

const schema = new Schema<RoomDoc>(
  {
    code: { type: String, required: true, unique: true, index: true },
    gameId: { type: String, required: true, default: "uno", index: true },
    name: { type: String, required: true },
    maxPlayers: { type: Number, required: true },
    mode: { type: String, required: true },
    isPrivate: { type: Boolean, required: true },
    turnTimeoutSec: { type: Number, required: true },
    hostPlayerId: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const RoomModel = mongoose.model<RoomDoc>("Room", schema);
