const DAILY_STREAK_TIME_ZONE = "Asia/Tehran";

function buildDateFormatter() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DAILY_STREAK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

const dayFormatter = buildDateFormatter();

function parseDayKey(dayKey: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function dateToUtcTimestamp(dayKey: string): number | null {
  const parsed = parseDayKey(dayKey);
  if (!parsed) return null;
  return Date.UTC(parsed.year, parsed.month - 1, parsed.day);
}

export function getDayKeyInTehran(date = new Date()): string {
  const parts = dayFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("failed to build daily streak day key");
  }

  return `${year}-${month}-${day}`;
}

export function addDaysToDayKey(dayKey: string, days: number): string | null {
  const ts = dateToUtcTimestamp(dayKey);
  if (ts === null) return null;

  const next = new Date(ts + days * 24 * 60 * 60 * 1000);
  const year = next.getUTCFullYear();
  const month = String(next.getUTCMonth() + 1).padStart(2, "0");
  const day = String(next.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function computeNextDailyWinStreak(input: {
  currentStreak?: number;
  bestStreak?: number;
  lastWinDayKey?: string | null;
  now?: Date;
}): { dailyWinStreak: number; bestDailyWinStreak: number; lastDailyWinDayKey: string } {
  const todayKey = getDayKeyInTehran(input.now);
  const currentStreak = Math.max(0, input.currentStreak ?? 0);
  const bestStreak = Math.max(0, input.bestStreak ?? 0);
  const lastWinDayKey = input.lastWinDayKey ?? null;

  let dailyWinStreak = 1;

  if (lastWinDayKey === todayKey) {
    dailyWinStreak = Math.max(1, currentStreak);
  } else if (lastWinDayKey && addDaysToDayKey(lastWinDayKey, 1) === todayKey) {
    dailyWinStreak = Math.max(1, currentStreak) + 1;
  }

  return {
    dailyWinStreak,
    bestDailyWinStreak: Math.max(bestStreak, dailyWinStreak),
    lastDailyWinDayKey: todayKey,
  };
}

export function getEffectiveDailyWinStreak(input: {
  currentStreak?: number;
  lastWinDayKey?: string | null;
  now?: Date;
}): number {
  const currentStreak = Math.max(0, input.currentStreak ?? 0);
  const lastWinDayKey = input.lastWinDayKey ?? null;
  if (!currentStreak || !lastWinDayKey) return 0;

  const todayKey = getDayKeyInTehran(input.now);
  if (lastWinDayKey === todayKey) return currentStreak;

  const yesterdayKey = addDaysToDayKey(todayKey, -1);
  if (yesterdayKey && lastWinDayKey === yesterdayKey) return currentStreak;

  return 0;
}
