import { Router } from "express";
import type { FeedbackService } from "../../../application/feedbackService.js";
import type { UserService } from "../../../application/userService.js";
import { optionalBearerAuth } from "../authMiddleware.js";
import { asyncHandler } from "../asyncHandler.js";
import { FeedbackController } from "../controllers/feedbackController.js";

export function createFeedbackRouter(feedbackService: FeedbackService, userService: UserService): Router {
  const router = Router();
  const controller = new FeedbackController(feedbackService);

  router.post("/", optionalBearerAuth(userService), asyncHandler(controller.submit));

  return router;
}
