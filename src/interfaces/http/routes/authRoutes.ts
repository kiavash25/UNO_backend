import { Router } from "express";
import type { UserService } from "../../../application/userService.js";
import { asyncHandler } from "../asyncHandler.js";
import { AuthController } from "../controllers/authController.js";

export function createAuthRouter(userService: UserService): Router {
  const router = Router();
  const controller = new AuthController(userService);

  router.post("/register", asyncHandler(controller.register));
  router.post("/login", asyncHandler(controller.login));

  return router;
}

