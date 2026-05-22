import { Router } from "express";
import { BotController } from "../controllers/botController.js";

export function createBotRouter(): Router {
  const router = Router();
  const controller = new BotController();

  router.get("/", controller.list);

  return router;
}

