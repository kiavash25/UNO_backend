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

function colorRunPenalty(cards: UnoCard[], candidate: UnoCard): number {
  const last = cards[cards.length - 1];
  const prev = cards[cards.length - 2];

  let penalty = 0;
  if (last?.color === candidate.color) penalty += 10;
  if (last?.color === candidate.color && prev?.color === candidate.color) penalty += 100;
  if (candidate.color === "black") penalty += 1;
  return penalty;
}

function smoothColorRuns(cards: UnoCard[]): UnoCard[] {
  const pool = shuffleRandom(cards);
  const result: UnoCard[] = [];

  while (pool.length > 0) {
    let bestIndex = 0;
    let bestPenalty = Number.POSITIVE_INFINITY;

    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i]!;
      const penalty = colorRunPenalty(result, candidate);
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestIndex = i;
        if (penalty === 0) break;
      }
    }

    result.push(pool.splice(bestIndex, 1)[0]!);
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
