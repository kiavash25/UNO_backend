import { getRankReward } from "../domain/cardGame/gameScoring.js";
import type { UserDoc, UserGameStats } from "../infrastructure/mongo/models/userModel.js";
import type { UserPatch } from "../infrastructure/mongo/userRepository.js";
import { computeNextDailyWinStreak } from "./dailyStreak.js";
import { levelFromXp } from "./userProfile.js";
import type { MatchRewardContext } from "./userService.js";

function normalizeGameStats(gameStats: UserDoc["gameStats"]): Record<string, UserGameStats> {
  if (!gameStats) return {};
  if (gameStats instanceof Map) return Object.fromEntries(gameStats.entries());
  return gameStats;
}

export function buildMatchRewardPatch(user: UserDoc, result: MatchRewardContext): UserPatch {
  const reward = getRankReward(result.gameId, result.rank, result.totalPlayers, result.isPrivate);
  const earnedXp = reward.xp;
  const won = result.won;
  const gameId = result.gameId;
  const gamesPlayed = user.gamesPlayed + 1;
  const wins = won ? user.wins + 1 : user.wins;
  const xp = user.xp + earnedXp;
  const coins = user.coins + reward.coins;
  const winStreak = won ? user.winStreak + 1 : 0;
  const bestWinStreak = won ? Math.max(user.bestWinStreak, winStreak) : user.bestWinStreak;
  const dailyStreakState = won
    ? computeNextDailyWinStreak({
        currentStreak: user.dailyWinStreak,
        bestStreak: user.bestDailyWinStreak,
        lastWinDayKey: user.lastDailyWinDayKey,
      })
    : {
        dailyWinStreak: user.dailyWinStreak ?? 0,
        bestDailyWinStreak: user.bestDailyWinStreak ?? 0,
        lastDailyWinDayKey: user.lastDailyWinDayKey,
      };
  const level = levelFromXp(xp);
  const accuracyPct = Math.min(100, Math.round((wins / gamesPlayed) * 100));
  const gameStats = normalizeGameStats(user.gameStats);
  const currentGameStats = gameStats[gameId] ?? { xp: 0, wins: 0, gamesPlayed: 0 };
  gameStats[gameId] = {
    xp: currentGameStats.xp + earnedXp,
    wins: won ? currentGameStats.wins + 1 : currentGameStats.wins,
    gamesPlayed: currentGameStats.gamesPlayed + 1,
  };

  return {
    gamesPlayed,
    wins,
    xp,
    coins,
    winStreak,
    bestWinStreak,
    dailyWinStreak: dailyStreakState.dailyWinStreak,
    bestDailyWinStreak: dailyStreakState.bestDailyWinStreak,
    lastDailyWinDayKey: dailyStreakState.lastDailyWinDayKey,
    level,
    accuracyPct,
    gameStats,
  };
}
