import type express from "express";
import { listCardGames } from "../../../domain/cardGame/gameRegistry.js";

export class GameController {
  list: express.RequestHandler = (_req, res) => {
    const games = listCardGames().map((game) => ({
      id: game.id,
      displayName: game.displayName,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
      supportsBots: Boolean(game.chooseBotAction),
    }));
    res.json({ games });
  };
}

