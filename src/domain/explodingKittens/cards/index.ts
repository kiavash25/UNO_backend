import { attackCardDefinition } from "./attack.js";
// import { catBeardCardDefinition } from "./catBeard.js";
// import { catMelonCardDefinition } from "./catMelon.js";
// import { catPotatoCardDefinition } from "./catPotato.js";
// import { catRainbowCardDefinition } from "./catRainbow.js";
// import { catTacoCardDefinition } from "./catTaco.js";
import { EXPLODING_KITTENS_CARD_OVERRIDES } from "./config.js";
import { defuseCardDefinition } from "./defuse.js";
import { explodingKittenCardDefinition } from "./explodingKitten.js";
import { favorCardDefinition } from "./favor.js";
// import { nopeCardDefinition } from "./nope.js";
import { seeFutureCardDefinition } from "./seeFuture.js";
import { shuffleCardDefinition } from "./shuffle.js";
import { skipCardDefinition } from "./skip.js";
import type {
  ConfiguredExplodingKittensCardDefinition,
  ExplodingKittensCardDefinition,
} from "./types.js";

const baseDefinitions: ExplodingKittensCardDefinition[] = [
  attackCardDefinition,
  skipCardDefinition,
  favorCardDefinition,
  shuffleCardDefinition,
  seeFutureCardDefinition,
//   nopeCardDefinition,
  defuseCardDefinition,
  explodingKittenCardDefinition,
//   catTacoCardDefinition,
//   catMelonCardDefinition,
//   catPotatoCardDefinition,
//   catBeardCardDefinition,
//   catRainbowCardDefinition,
];

export function listExplodingKittensCardDefinitions(): ExplodingKittensCardDefinition[] {
  return [...baseDefinitions];
}

export function getExplodingKittensCardDefinition(type: string): ExplodingKittensCardDefinition | null {
  return baseDefinitions.find((definition) => definition.type === type) ?? null;
}

export function listConfiguredExplodingKittensCardDefinitions(): ConfiguredExplodingKittensCardDefinition[] {
  return baseDefinitions.map((definition) => {
    const override = EXPLODING_KITTENS_CARD_OVERRIDES[definition.type] ?? {};
    return {
      ...definition,
      copies: Math.max(0, override.copies ?? definition.copies),
      enabled: override.enabled ?? definition.enabledByDefault,
    };
  });
}

