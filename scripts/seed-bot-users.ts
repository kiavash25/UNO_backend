import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { levelFromXp } from "../src/application/userProfile.js";
import { loadEnv } from "../src/config/env.js";
import { AVATAR_OPTIONS } from "../src/constant/avatar.cons.js";
import { connectMongo, disconnectMongo } from "../src/infrastructure/mongo/connection.js";
import { UserModel, type UserGameStats } from "../src/infrastructure/mongo/models/userModel.js";

type BotIdentity = {
  key: string;
  displayName: string;
  avatarGender: "m" | "f";
};

type BotSeed = BotIdentity & {
  username: string;
  phone: string;
  avatar: string;
  xp: number;
  level: number;
  coins: number;
  wins: number;
  gamesPlayed: number;
  winStreak: number;
  bestWinStreak: number;
  accuracyPct: number;
  gameStats: Record<string, UserGameStats>;
};

function createRandom(seedText: string): () => number {
  let seed = 2_166_136_261;
  for (const char of seedText) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16_777_619);
  }

  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function buildBot(identity: BotIdentity): BotSeed {
  const random = createRandom(`cardix-bot-v2:${identity.key}`);
  const avatars = AVATAR_OPTIONS.filter((avatar) =>
    avatar.includes(`/av${identity.avatarGender}`),
  );
  if (avatars.length === 0) {
    throw new Error(`No ${identity.avatarGender} avatars configured`);
  }
  const gamesPlayed = randomInt(random, 12, 38);
  const winRate = 0.27 + random() * 0.16;
  const wins = Math.max(3, Math.min(gamesPlayed, Math.round(gamesPlayed * winRate)));
  const xp = randomInt(random, 280, 1_480);
  const coins = randomInt(random, 120, 420);
  const unoGames = Math.max(4, Math.min(gamesPlayed - 4, Math.round(gamesPlayed * (0.42 + random() * 0.16))));
  const kittensGames = gamesPlayed - unoGames;
  const unoWins = Math.min(unoGames, Math.round(wins * (unoGames / gamesPlayed)));
  const kittensWins = Math.min(kittensGames, wins - unoWins);
  const unoXp = Math.round(xp * (unoGames / gamesPlayed));

  return {
    ...identity,
    username: `cardix_${identity.key}`,
    phone: `bot_seed_v2_${identity.key}`,
    avatar: avatars[randomInt(random, 0, avatars.length - 1)]!,
    xp,
    level: levelFromXp(xp),
    coins,
    wins: unoWins + kittensWins,
    gamesPlayed,
    winStreak: randomInt(random, 0, 2),
    bestWinStreak: randomInt(random, 2, 6),
    accuracyPct: Math.round(((unoWins + kittensWins) / gamesPlayed) * 100),
    gameStats: {
      uno: { xp: unoXp, wins: unoWins, gamesPlayed: unoGames },
      exploding_kittens: {
        xp: xp - unoXp,
        wins: kittensWins,
        gamesPlayed: kittensGames,
      },
    },
  };
}

function validateIdentities(identities: BotIdentity[]): void {
  if (identities.length !== 50) {
    throw new Error(`Expected exactly 50 bot identities, received ${identities.length}`);
  }

  const keys = new Set<string>();
  const names = new Set<string>();
  for (const identity of identities) {
    const key = identity.key.trim().toLowerCase();
    const name = identity.displayName.trim().toLocaleLowerCase("fa");
    if (!key || !name) throw new Error("Bot key and displayName are required");
    if (identity.avatarGender !== "m" && identity.avatarGender !== "f") {
      throw new Error(`Invalid avatarGender for bot: ${identity.key}`);
    }
    if (keys.has(key)) throw new Error(`Duplicate bot key: ${key}`);
    if (names.has(name)) throw new Error(`Duplicate bot displayName: ${identity.displayName}`);
    keys.add(key);
    names.add(name);
  }
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const jsonPath = path.resolve(here, "bot-users.json");
  const identities = JSON.parse(await readFile(jsonPath, "utf8")) as BotIdentity[];
  validateIdentities(identities);
  const bots = identities.map(buildBot);

  if (process.argv.includes("--preview")) {
    console.table(
      bots.map(({ displayName, avatar, level, xp, coins, wins, gamesPlayed }) => ({
        displayName,
        avatar,
        level,
        xp,
        coins,
        wins,
        gamesPlayed,
      })),
    );
    return;
  }

  const env = loadEnv();
  await connectMongo(env.MONGODB_URI);
  const passwordHash = await bcrypt.hash(`bot-seed:${env.JWT_SECRET}`, env.BCRYPT_COST);

  const result = await UserModel.bulkWrite(
    bots.map((bot) => ({
      updateOne: {
        filter: {
          isBot: true,
          $or: [
            { "botProfile.key": bot.key },
            { username: `${bot.key}_bot` },
            { username: bot.username },
          ],
        },
        update: {
          $set: {
            displayName: bot.displayName,
            avatar: bot.avatar,
            isBot: true,
            botProfile: { key: bot.key, difficulty: "normal" },
          },
          $setOnInsert: {
            phone: bot.phone,
            username: bot.username,
            passwordHash,
            xp: bot.xp,
            level: bot.level,
            coins: bot.coins,
            wins: bot.wins,
            gamesPlayed: bot.gamesPlayed,
            winStreak: bot.winStreak,
            bestWinStreak: bot.bestWinStreak,
            accuracyPct: bot.accuracyPct,
            gameStats: bot.gameStats,
          },
        },
        upsert: true,
      },
    })),
    { ordered: true },
  );

  console.log(
    `Bot seed done. inserted=${result.upsertedCount}, existing=${result.matchedCount}, catalog=${bots.length}`,
  );
  await disconnectMongo();
}

main().catch(async (error) => {
  console.error("Bot seed failed:", error);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
