import type { PlayerProfile } from "../roomTypes.js";

export type BotProfile = Omit<PlayerProfile, "id" | "isBot"> & {
  key: string;
};

const BOT_PROFILES: BotProfile[] = [
  {
    key: "ava",
    username: "ava_bot",
    displayName: "آوا",
    avatar: "/assets/avatars/avatar_1.png",
    xp: 1260,
    level: 4,
    coins: 420,
    wins: 18,
    gamesPlayed: 45,
    winStreak: 2,
    bestWinStreak: 6,
    accuracyPct: 40,
  },
  {
    key: "parsa",
    username: "parsa_bot",
    displayName: "پارسا",
    avatar: "/assets/avatars/avatar_2.png",
    xp: 2140,
    level: 5,
    coins: 680,
    wins: 31,
    gamesPlayed: 70,
    winStreak: 1,
    bestWinStreak: 8,
    accuracyPct: 44,
  },
  {
    key: "nima",
    username: "nima_bot",
    displayName: "نیما",
    avatar: "/assets/avatars/avatar_3.png",
    xp: 870,
    level: 3,
    coins: 310,
    wins: 11,
    gamesPlayed: 34,
    winStreak: 0,
    bestWinStreak: 4,
    accuracyPct: 32,
  },
  {
    key: "taraneh",
    username: "taraneh_bot",
    displayName: "ترانه",
    avatar: "/assets/avatars/avatar_4.png",
    xp: 3050,
    level: 6,
    coins: 930,
    wins: 43,
    gamesPlayed: 92,
    winStreak: 3,
    bestWinStreak: 9,
    accuracyPct: 47,
  },
  {
    key: "arin",
    username: "arin_bot",
    displayName: "آرین",
    avatar: "/assets/avatars/avatar_5.png",
    xp: 1520,
    level: 4,
    coins: 510,
    wins: 21,
    gamesPlayed: 55,
    winStreak: 1,
    bestWinStreak: 5,
    accuracyPct: 38,
  },
  {
    key: "helia",
    username: "helia_bot",
    displayName: "هلیا",
    avatar: "/assets/avatars/avatar_6.png",
    xp: 2410,
    level: 5,
    coins: 740,
    wins: 35,
    gamesPlayed: 81,
    winStreak: 0,
    bestWinStreak: 7,
    accuracyPct: 43,
  },
  {
    key: "mani",
    username: "mani_bot",
    displayName: "مانی",
    avatar: "/assets/avatars/avatar_7.png",
    xp: 980,
    level: 3,
    coins: 360,
    wins: 14,
    gamesPlayed: 39,
    winStreak: 2,
    bestWinStreak: 4,
    accuracyPct: 36,
  },
  {
    key: "dina",
    username: "dina_bot",
    displayName: "دینا",
    avatar: "/assets/avatars/avatar_8.png",
    xp: 1870,
    level: 4,
    coins: 590,
    wins: 27,
    gamesPlayed: 66,
    winStreak: 4,
    bestWinStreak: 6,
    accuracyPct: 41,
  },
];

export class BotProfileService {
  list(): BotProfile[] {
    return BOT_PROFILES;
  }

  pick(count: number, takenDisplayNames = new Set<string>()): BotProfile[] {
    const available = BOT_PROFILES.filter((profile) => !takenDisplayNames.has(profile.displayName));
    const source = available.length >= count ? available : BOT_PROFILES;
    return [...source].sort(() => Math.random() - 0.5).slice(0, count);
  }

  toPlayerProfile(bot: BotProfile, displayName = bot.displayName): PlayerProfile {
    return {
      id: `bot:${bot.key}`,
      username: bot.username,
      displayName,
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
    };
  }
}
