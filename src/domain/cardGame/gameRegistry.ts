import type { CardGameDefinition } from "./cardGame.js";
import { explodingKittensGameDefinition } from "../explodingKittens/explodingKittensGame.js";
import { unoGameDefinition } from "../uno/unoGame.js";

const games = new Map<string, CardGameDefinition>();

export function registerCardGame(game: CardGameDefinition): void {
  games.set(game.id, game);
}

export function getCardGame(gameId: string): CardGameDefinition | null {
  return games.get(gameId) ?? null;
}

export function listCardGames(): CardGameDefinition[] {
  return [...games.values()];
}

registerCardGame(unoGameDefinition);
registerCardGame(explodingKittensGameDefinition);
