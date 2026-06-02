import { z } from "zod";

export const authMessageSchema = z.object({
  type: z.literal("auth"),
  token: z.string().min(10),
});

const lobbyReady = z.object({
  type: z.literal("lobby.ready"),
  ready: z.boolean(),
});

const lobbyChat = z.object({
  type: z.literal("lobby.chat"),
  text: z.string().max(200).optional(),
  emoji: z.string().max(8).optional(),
});

const gameStart = z.object({
  type: z.literal("game.start"),
});

const gameAction = z.object({
  type: z.literal("game.action"),
  action: z.object({ type: z.string().min(1) }).passthrough(),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  lobbyReady,
  lobbyChat,
  gameStart,
  gameAction,
]);

export type AuthMessage = z.infer<typeof authMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
