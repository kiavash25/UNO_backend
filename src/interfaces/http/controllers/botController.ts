import type express from "express";
import { BotProfileService } from "../../../application/bots/botProfiles.js";

export class BotController {
  constructor(private readonly bots = new BotProfileService()) {}

  list: express.RequestHandler = (_req, res) => {
    const bots = this.bots.list().map((bot) => ({
      id: `bot:${bot.key}`,
      username: bot.username,
      displayName: bot.displayName,
      avatar: bot.avatar,
      xp: bot.xp,
      level: bot.level,
      coins: bot.coins,
      wins: bot.wins,
      gamesPlayed: bot.gamesPlayed,
      winStreak: bot.winStreak,
      bestWinStreak: bot.bestWinStreak,
      accuracyPct: bot.accuracyPct,
      isBot: true,
    }));
    res.json({ bots });
  };
}

