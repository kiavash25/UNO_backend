import type { ExplodingKittensCard } from "./card.js";
import { shuffleCards } from "./engineHelpers.js";
import { listConfiguredExplodingKittensCardDefinitions } from "./cards/index.js";

const ACTION_COPIES_BY_PLAYER_COUNT: Record<number, Record<string, number>> = {
  2: { attack: 4, skip: 4, favor: 3, shuffle: 3, see_future: 5 },
  3: { attack: 5, skip: 5, favor: 4, shuffle: 4, see_future: 6 },
  4: { attack: 6, skip: 6, favor: 5, shuffle: 5, see_future: 7 },
  5: { attack: 7, skip: 7, favor: 6, shuffle: 6, see_future: 8 },
};

function createCardFactory() {
  const counters: Record<string, number> = {};

  return (type: string, label: string): ExplodingKittensCard => {
    counters[type] = (counters[type] ?? 0) + 1;
    return {
      id: `ek_${type}_${counters[type]}`,
      type,
      label,
    };
  };
}

export function buildExplodingKittensSetup(playerIds: string[]): {
  drawPile: ExplodingKittensCard[];
  hands: Record<string, ExplodingKittensCard[]>;
  enabledCardTypes: string[];
} {
  const configured = listConfiguredExplodingKittensCardDefinitions().filter((definition) => definition.enabled);
  const actionCopies = ACTION_COPIES_BY_PLAYER_COUNT[playerIds.length] ?? {};
  const makeCard = createCardFactory();
  const enabledCardTypes = configured.map((definition) => definition.type);
  const defuseDefinition = configured.find((definition) => definition.type === "defuse") ?? null;
  const explodingDefinition =
    configured.find((definition) => definition.type === "exploding_kitten") ?? null;

  const drawCandidates: ExplodingKittensCard[] = [];
  for (const definition of configured) {
    if (definition.type === "defuse" || definition.type === "exploding_kitten") continue;
    const copies = actionCopies[definition.type] ?? definition.copies;
    for (let count = 0; count < copies; count += 1) {
      drawCandidates.push(makeCard(definition.type, definition.label));
    }
  }

  const shuffledPool = shuffleCards(drawCandidates);
  const hands: Record<string, ExplodingKittensCard[]> = Object.fromEntries(
    playerIds.map((playerId) => [playerId, []]),
  ) as Record<string, ExplodingKittensCard[]>;

  for (const playerId of playerIds) {
    if (defuseDefinition) {
      hands[playerId]!.push(makeCard(defuseDefinition.type, defuseDefinition.label));
    }

    for (let count = 0; count < 4; count += 1) {
      const card = shuffledPool.pop();
      if (!card) throw new Error("not enough cards to deal Exploding Kittens hands");
      hands[playerId]!.push(card);
    }
  }

  const drawPile = [...shuffledPool];
  const remainingDefuses = Math.max(0, (defuseDefinition?.copies ?? 0) - playerIds.length);
  const extraDefuses = playerIds.length <= 3 ? Math.min(2, remainingDefuses) : remainingDefuses;
  for (let count = 0; count < extraDefuses; count += 1) {
    drawPile.push(makeCard(defuseDefinition!.type, defuseDefinition!.label));
  }

  const explodingCount = Math.max(0, Math.min(playerIds.length - 1, explodingDefinition?.copies ?? 0));
  for (let count = 0; count < explodingCount; count += 1) {
    drawPile.push(makeCard(explodingDefinition!.type, explodingDefinition!.label));
  }

  return {
    drawPile: shuffleCards(drawPile),
    hands,
    enabledCardTypes,
  };
}
