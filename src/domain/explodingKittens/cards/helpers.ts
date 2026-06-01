import type { ExplodingKittensCardDefinition } from "./types.js";

export function defineCatCard(input: {
  type: string;
  label: string;
  comboFamily: string;
  copies?: number;
  enabledByDefault?: boolean;
}): ExplodingKittensCardDefinition {
  return {
    type: input.type,
    label: input.label,
    copies: input.copies ?? 4,
    enabledByDefault: input.enabledByDefault ?? true,
    category: "cat",
    comboFamily: input.comboFamily,
    playMode: "never",
  };
}

