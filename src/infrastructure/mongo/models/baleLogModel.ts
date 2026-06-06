import mongoose, { Schema } from "mongoose";

export type BaleLogEvent =
  | "incoming_message"
  | "incoming_callback"
  | "outgoing_message"
  | "webhook_error";

export type BaleLogDoc = {
  _id: mongoose.Types.ObjectId;
  event: BaleLogEvent;
  chatId?: string;
  baleUserId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  platformUserId?: string;
  platformDisplayName?: string;
  text?: string;
  callbackData?: string;
  messageId?: number;
  updateId?: number;
  status?: "success" | "error";
  errorMessage?: string;
  raw?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const baleLogSchema = new Schema<BaleLogDoc>(
  {
    event: {
      type: String,
      enum: ["incoming_message", "incoming_callback", "outgoing_message", "webhook_error"],
      required: true,
      index: true,
    },
    chatId: { type: String, trim: true, index: true },
    baleUserId: { type: String, trim: true, index: true },
    username: { type: String, trim: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    platformUserId: { type: String, trim: true, index: true },
    platformDisplayName: { type: String, trim: true },
    text: { type: String },
    callbackData: { type: String, trim: true },
    messageId: { type: Number },
    updateId: { type: Number, index: true },
    status: { type: String, enum: ["success", "error"] },
    errorMessage: { type: String },
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: true, collection: "bale_logs" },
);

export const BaleLogModel = mongoose.model<BaleLogDoc>("BaleLog", baleLogSchema);
