import { customAlphabet } from "nanoid";

const playerToken = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 32);
const playerId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

export function newPlayerToken(): string {
  return playerToken();
}

export function newPlayerId(): string {
  return playerId();
}

export type SessionPayload = {
  roomId: string;
  playerId: string;
  userId?: string;
};
