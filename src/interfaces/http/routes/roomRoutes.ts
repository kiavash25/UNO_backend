import { Router } from "express";
import type { RoomService } from "../../../application/roomService.js";
import type { UserService } from "../../../application/userService.js";
import { asyncHandler } from "../asyncHandler.js";
import { optionalBearerAuth } from "../authMiddleware.js";
import { RoomController } from "../controllers/roomController.js";

export function createRoomRouter(roomService: RoomService, userService: UserService): Router {
  const router = Router();
  const controller = new RoomController(roomService);
  const optionalAuth = optionalBearerAuth(userService);

  router.post("/", optionalAuth, asyncHandler(controller.create));
  router.post("/join", optionalAuth, asyncHandler(controller.join));
  router.get("/public", asyncHandler(controller.listPublic));
  router.post("/quick", optionalAuth, asyncHandler(controller.quickPlay));
  router.post("/bot-match", optionalAuth, asyncHandler(controller.createBotMatch));
  router.get("/:code", asyncHandler(controller.getByCode));

  return router;
}
