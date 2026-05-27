import mongoose, { Schema } from "mongoose";

export type FeedbackKind = "idea" | "bug";

export type FeedbackDoc = {
  _id: mongoose.Types.ObjectId;
  kind: FeedbackKind;
  message: string;
  contact?: string;
  path: string;
  displayName?: string;
  userId?: string;
  userPhone?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
};

const feedbackSchema = new Schema<FeedbackDoc>(
  {
    kind: { type: String, enum: ["idea", "bug"], required: true },
    message: { type: String, required: true, trim: true },
    contact: { type: String, trim: true },
    path: { type: String, required: true, trim: true },
    displayName: { type: String, trim: true },
    userId: { type: String, trim: true, index: true },
    userPhone: { type: String, trim: true },
    userAgent: { type: String, trim: true },
  },
  { timestamps: true },
);

export const FeedbackModel = mongoose.model<FeedbackDoc>("Feedback", feedbackSchema);
