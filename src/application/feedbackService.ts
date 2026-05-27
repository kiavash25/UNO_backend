import { FeedbackRepository, type FeedbackCreateInput } from "../infrastructure/mongo/feedbackRepository.js";

export type SubmitFeedbackInput = FeedbackCreateInput;

export class FeedbackService {
  constructor(private readonly feedbacks: FeedbackRepository) {}

  async submit(input: SubmitFeedbackInput): Promise<{ id: string }> {
    const feedback = await this.feedbacks.create({
      ...input,
      message: input.message.trim(),
      contact: input.contact?.trim() || undefined,
      path: input.path.trim(),
      displayName: input.displayName?.trim() || undefined,
      userAgent: input.userAgent?.trim() || undefined,
    });

    return { id: String(feedback._id) };
  }
}
