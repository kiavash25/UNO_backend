import { Router } from "express";
import { GameController } from "../controllers/gameController.js";

export function createGameRouter(): Router {
  const router = Router();
  const controller = new GameController();

  router.get("/", controller.list);

  return router;
}

