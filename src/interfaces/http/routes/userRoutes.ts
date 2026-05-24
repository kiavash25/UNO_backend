import { Router } from "express";
import type { RoomService } from "../../../application/roomService.js";
import type { UserService } from "../../../application/userService.js";
import { asyncHandler } from "../asyncHandler.js";
import { bearerAuth } from "../authMiddleware.js";
import { UserController } from "../controllers/userController.js";

export function createUserRouter(userService: UserService, roomService: RoomService): Router {
  const router = Router();
  const controller = new UserController(userService, roomService);
  const auth = bearerAuth(userService);

  router.get("/leaderboard/:scope", asyncHandler(controller.leaderboard));
  router.get("/me", auth, asyncHandler(controller.me));
  router.patch("/me", auth, asyncHandler(controller.updateMe));
  router.patch("/me/password", auth, asyncHandler(controller.changePassword));
  router.post("/me/match", auth, asyncHandler(controller.recordMatch));

  return router;
}
