import { randomInt } from "node:crypto";
import { customAlphabet } from "nanoid";
import type { UnoCard, UnoColor, UnoRank } from "./card.js";

const id = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

const COLORS: Exclude<UnoColor, "black">[] = ["red", "yellow", "green", "blue"];

const NUMBER_RANKS: UnoRank[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

function make(color: UnoColor, rank: UnoRank): UnoCard {
  return { id: id(), color, rank };
}

function shuffleRandom<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function smoothColorRuns(cards: UnoCard[]): UnoCard[] {
  const result = shuffleRandom(cards);

  for (let i = 2; i < result.length; i++) {
    const a = result[i - 2];
    const b = result[i - 1];
    const c = result[i];
    if (!a || !b || !c) continue;
    if (a.color !== b.color || b.color !== c.color) continue;

    let swapIndex = -1;
    for (let j = i + 1; j < result.length; j++) {
      const candidate = result[j];
      if (!candidate) continue;
      if (candidate.color === c.color) continue;

      const prev = result[i - 1];
      const next = result[i + 1];
      const createsPrevRun = prev?.color === candidate.color && a.color === candidate.color;
      const createsNextRun = next?.color === candidate.color && prev?.color === candidate.color;
      if (!createsPrevRun && !createsNextRun) {
        swapIndex = j;
        break;
      }
    }

    if (swapIndex >= 0) {
      [result[i], result[swapIndex]] = [result[swapIndex]!, result[i]!];
    }
  }

  return result;
}

/** دست استاندارد UNO (بدون کارت‌های سفارشی برند). */
export function createShuffledDeck(playerCount: number): UnoCard[] {
  if (playerCount < 2 || playerCount > 10) {
    throw new Error("player count must be 2..10");
  }

  const deck: UnoCard[] = [];

  for (const c of COLORS) {
    for (const r of NUMBER_RANKS) {
      deck.push(make(c, r));
    }
    deck.push(make(c, "skip"));
    deck.push(make(c, "reverse"));
    deck.push(make(c, "draw2"));
  }

  for (let i = 0; i < playerCount; i++) deck.push(make("black", "wild"));
  for (let i = 0; i < playerCount; i++) deck.push(make("black", "wild4"));

  return shuffleUnoCards(deck);
}

export function shuffle<T>(arr: T[]): T[] {
  return shuffleRandom(arr);
}

export function shuffleUnoCards(cards: UnoCard[]): UnoCard[] {
  return smoothColorRuns(cards);
}
