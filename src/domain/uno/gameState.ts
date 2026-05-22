import type { UnoCard, UnoColor } from "./card.js";

export type PlayerId = string;

export type Direction = 1 | -1;

export type UnoGameStatus = "playing" | "finished";

export type UnoPublicPlayer = {
  id: PlayerId;
  displayName: string;
  avatar?: string;
  handCount: number;
  saidUno: boolean;
};

export type UnoDrawStack = {
  playerId: PlayerId;
  amount: number;
  color: Exclude<UnoColor, "black">;
};

export type UnoGameState = {
  status: UnoGameStatus;
  /** ترتیب نوبت همان ترتیب آرایه بازیکنان است؛ ایندکس فعلی نوبت */
  turnIndex: number;
  direction: Direction;
  drawPile: UnoCard[];
  discardPile: UnoCard[];
  /** رنگ فعال روی میز (بعد از wild) */
  currentColor: Exclude<UnoColor, "black">;
  players: UnoPublicPlayer[];
  /** دست هر بازیکن — در خروجی به کلاینت فقط برای خودش فرستاده می‌شود */
  hands: Record<PlayerId, UnoCard[]>;
  winnerId: PlayerId | null;
  /** اگر بازیکن کارت کشیده و هنوز pass نکرده */
  pendingDrawPass: PlayerId | null;
  pendingDrawStack: UnoDrawStack | null;
};
