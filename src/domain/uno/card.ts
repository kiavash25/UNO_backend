export type UnoColor = "red" | "yellow" | "green" | "blue" | "black";

export type UnoRank =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "skip"
  | "reverse"
  | "draw2"
  | "wild"
  | "wild4";

export type UnoCard = {
  id: string;
  color: UnoColor;
  rank: UnoRank;
};

export function isWild(card: UnoCard): boolean {
  return card.rank === "wild" || card.rank === "wild4";
}

export function cardMatchesTop(
  card: UnoCard,
  top: UnoCard,
  currentColor: Exclude<UnoColor, "black">,
): boolean {
  if (isWild(card)) return true;
  if (card.color === "black") return false;
  if (card.color === currentColor) return true;
  if (card.rank === top.rank && !isWild(top)) return true;
  return false;
}
