import { Router } from "express";
import type { BaleService } from "../../../application/baleService.js";
import { asyncHandler } from "../asyncHandler.js";
import { BaleController } from "../controllers/baleController.js";

export function createBaleRouter(baleService: BaleService): Router {
  const router = Router();
  const controller = new BaleController(baleService);

  router.post("/webhook/bale", asyncHandler(controller.create));

  return router;
}
