import type express from "express";
import { z } from "zod";
import type { FeedbackService } from "../../../application/feedbackService.js";

const feedbackBody = z.object({
  kind: z.enum(["idea", "bug"]),
  message: z.string().trim().min(8).max(1000),
  contact: z.string().trim().max(80).optional(),
  path: z.string().trim().min(1).max(120),
  displayName: z.string().trim().max(32).optional(),
});

export class FeedbackController {
  constructor(private readonly feedbacks: FeedbackService) {}

  submit: express.RequestHandler = async (req, res) => {
    const body = feedbackBody.parse(req.body);
    const out = await this.feedbacks.submit({
      ...body,
      userId: req.authed?.userId,
      userPhone: req.authed?.phone,
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
    });

    res.status(201).json({ ok: true, ...out });
  };
}
