import { customAlphabet } from "nanoid";

const codeGen = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 4);

export function generateRoomCode(): string {
  return codeGen();
}
