import { customAlphabet } from "nanoid";
import type { UnoCard, UnoColor, UnoRank } from "./card.js";

const id = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

const COLORS: Exclude<UnoColor, "black">[] = ["red", "yellow", "green", "blue"];

const NUMBER_RANKS: UnoRank[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

function make(color: UnoColor, rank: UnoRank): UnoCard {
  return { id: id(), color, rank };
}

/** دست استاندارد UNO (بدون کارت‌های سفارشی برند). */
export function createShuffledDeck(): UnoCard[] {
  const deck: UnoCard[] = [];

  for (const c of COLORS) {
    for (const r of NUMBER_RANKS) {
      deck.push(make(c, r), make(c, r));
    }
    deck.push(make(c, "skip"), make(c, "skip"));
    deck.push(make(c, "reverse"), make(c, "reverse"));
    deck.push(make(c, "draw2"), make(c, "draw2"));
  }

  for (let i = 0; i < 4; i++) deck.push(make("black", "wild"));
  for (let i = 0; i < 4; i++) deck.push(make("black", "wild4"));

  return shuffle(deck);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
