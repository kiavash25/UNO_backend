import { Router } from "express";
import type { RoomService } from "../../../application/roomService.js";
import { asyncHandler } from "../asyncHandler.js";
import { RoomController } from "../controllers/roomController.js";

export function createRoomRouter(roomService: RoomService): Router {
  const router = Router();
  const controller = new RoomController(roomService);

  router.post("/", asyncHandler(controller.create));
  router.post("/join", asyncHandler(controller.join));
  router.get("/public", asyncHandler(controller.listPublic));
  router.post("/quick", asyncHandler(controller.quickPlay));
  router.post("/bot-match", asyncHandler(controller.createBotMatch));
  router.get("/:code", asyncHandler(controller.getByCode));

  return router;
}

