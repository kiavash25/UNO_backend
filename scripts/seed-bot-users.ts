import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/config/env.js";
import { connectMongo, disconnectMongo } from "../src/infrastructure/mongo/connection.js";
import { UserModel } from "../src/infrastructure/mongo/models/userModel.js";

type BotSeed = {
  key: string;
  username: string;
  phone: string;
  displayName: string;
  avatar: string;
  xp: number;
  level: number;
  coins: number;
  wins: number;
  gamesPlayed: number;
  winStreak: number;
  bestWinStreak: number;
  accuracyPct: number;
  gameStats?: Record<string, { xp: number; wins: number; gamesPlayed: number }>;
};

async function main() {
  const env = loadEnv();
  await connectMongo(env.MONGODB_URI);

  const here = path.dirname(fileURLToPath(import.meta.url));
  const jsonPath = path.resolve(here, "bot-users.json");
  const raw = await readFile(jsonPath, "utf8");
  const bots = JSON.parse(raw) as BotSeed[];

  const passwordHash = await bcrypt.hash(`bot-seed:${env.JWT_SECRET}`, env.BCRYPT_COST);
  let inserted = 0;
  let existed = 0;

  for (const bot of bots) {
    const result = await UserModel.updateOne(
      { username: bot.username },
      {
        $setOnInsert: {
          phone: bot.phone.trim(),
          username: bot.username.trim().toLowerCase(),
          passwordHash,
          displayName: bot.displayName.trim(),
          avatar: bot.avatar.trim(),
          xp: bot.xp,
          level: bot.level,
          coins: bot.coins,
          wins: bot.wins,
          gamesPlayed: bot.gamesPlayed,
          winStreak: bot.winStreak,
          bestWinStreak: bot.bestWinStreak,
          accuracyPct: bot.accuracyPct,
          gameStats: bot.gameStats ?? {},
          isBot: true,
          botProfile: {
            key: bot.key,
            difficulty: "normal",
          },
        },
      },
      { upsert: true },
    );

    if (result.upsertedCount > 0) inserted += 1;
    else existed += 1;
  }

  console.log(`Bot seed done. inserted=${inserted}, existed=${existed}, total=${bots.length}`);
  await disconnectMongo();
}

main().catch(async (err) => {
  console.error("Bot seed failed:", err);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
