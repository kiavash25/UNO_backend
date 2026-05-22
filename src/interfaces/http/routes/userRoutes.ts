import { Router } from "express";
import type { UserService } from "../../../application/userService.js";
import { asyncHandler } from "../asyncHandler.js";
import { bearerAuth } from "../authMiddleware.js";
import { UserController } from "../controllers/userController.js";

export function createUserRouter(userService: UserService): Router {
  const router = Router();
  const controller = new UserController(userService);
  const auth = bearerAuth(userService);

  router.get("/me", auth, asyncHandler(controller.me));
  router.patch("/me", auth, asyncHandler(controller.updateMe));
  router.patch("/me/password", auth, asyncHandler(controller.changePassword));
  router.post("/me/match", auth, asyncHandler(controller.recordMatch));

  return router;
}

