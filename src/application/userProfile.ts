/** آواتارهای پیش‌فرض (هم‌نام با فرانت). */
export const AVATAR_OPTIONS = ["🦊", "🐼", "🐯", "🐸", "🦁", "🐻", "🐨", "🦄"] as const;

export type AvatarId = (typeof AVATAR_OPTIONS)[number];

export function isAllowedAvatar(s: string): s is AvatarId {
  return (AVATAR_OPTIONS as readonly string[]).includes(s);
}

const XP_PER_LEVEL = 500;

export function levelFromXp(xp: number): number {
  return Math.min(99, 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL));
}

export function xpProgress(xp: number): { xpIntoLevel: number; xpForNextLevel: number; level: number } {
  const level = levelFromXp(xp);
  const xpIntoLevel = xp % XP_PER_LEVEL;
  return { xpIntoLevel, xpForNextLevel: XP_PER_LEVEL, level };
}

const RANK_THRESHOLDS: [number, string][] = [
  [1, "تازه‌وار"],
  [3, "بازیکن تازه‌کار"],
  [6, "ردیاب رنگ‌ها"],
  [10, "ستاره اونو"],
  [15, "استاد میز"],
  [25, "حرفه‌ای پارتی"],
  [40, "افسانه اونو"],
];

export function rankTitleForLevel(level: number): string {
  let title = RANK_THRESHOLDS[0]![1];
  for (const [lv, t] of RANK_THRESHOLDS) {
    if (level >= lv) title = t;
  }
  return title;
}
