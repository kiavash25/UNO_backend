import type { FeedbackDoc, FeedbackKind } from "./models/feedbackModel.js";
import { FeedbackModel } from "./models/feedbackModel.js";

export type FeedbackCreateInput = {
  kind: FeedbackKind;
  message: string;
  contact?: string;
  path: string;
  displayName?: string;
  userId?: string;
  userPhone?: string;
  userAgent?: string;
};

export class FeedbackRepository {
  async create(input: FeedbackCreateInput): Promise<FeedbackDoc> {
    const created = await FeedbackModel.create(input);
    const feedback = await FeedbackModel.findById(created._id).lean<FeedbackDoc>().exec();
    if (!feedback) throw new Error("feedback persist failed");
    return feedback;
  }
}
