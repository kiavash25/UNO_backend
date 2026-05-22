import type { IncomingMessage } from "http";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { RoomService } from "../../application/roomService.js";
import { WsHub } from "./wsHub.js";

const authMsg = z.object({
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

const gamePlay = z.object({
  type: z.literal("game.playCard"),
  cardId: z.string().min(1),
  chosenColor: z.enum(["red", "yellow", "green", "blue"]).optional(),
  declareUno: z.boolean().optional(),
});

const gameDraw = z.object({ type: z.literal("game.draw") });
const gamePass = z.object({ type: z.literal("game.pass") });
const gameUno = z.object({ type: z.literal("game.uno") });
const gameAction = z.object({
  type: z.literal("game.action"),
  action: z.object({ type: z.string().min(1) }).passthrough(),
});

const clientMessage = z.discriminatedUnion("type", [
  authMsg,
  lobbyReady,
  lobbyChat,
  gameStart,
  gamePlay,
  gameDraw,
  gamePass,
  gameUno,
  gameAction,
]);

export function attachWsServer(params: { server: import("http").Server; roomService: RoomService; hub: WsHub }) {
  const wss = new WebSocketServer({ server: params.server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    let authed = false;

    ws.on("message", async (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        params.hub.sendError(ws, "parse", "پیام JSON نیست");
        return;
      }

      if (!authed) {
        const first = authMsg.safeParse(parsed);
        if (!first.success) {
          params.hub.sendError(ws, "auth", "ابتدا پیام auth بفرستید");
          return;
        }
        const ok = await params.hub.authenticate(ws, first.data.token);
        if (!ok) {
          params.hub.sendError(ws, "auth", "توکن نامعتبر است");
          ws.close();
          return;
        }
        authed = true;
        const meta = params.hub.getMeta(ws);
        if (meta) {
          ws.send(
            JSON.stringify({
              type: "authenticated",
              roomId: meta.roomId,
              playerId: meta.playerId,
            }),
          );
        }
        return;
      }

      const msg = clientMessage.safeParse(parsed);
      if (!msg.success) {
        params.hub.sendError(ws, "validation", "ساختار پیام نامعتبر است");
        return;
      }

      const meta = params.hub.getMeta(ws);
      if (!meta) {
        params.hub.sendError(ws, "internal", "متای سوکت گم شده");
        return;
      }

      try {
        switch (msg.data.type) {
          case "lobby.ready":
            await params.roomService.setReady(meta.token, msg.data.ready);
            break;
          case "lobby.chat":
            params.hub.broadcastEvent(meta.roomId, {
              type: "lobby.chat",
              fromPlayerId: meta.playerId,
              text: msg.data.text,
              emoji: msg.data.emoji,
              ts: Date.now(),
            });
            break;
          case "game.start":
            await params.roomService.startGame(meta.token);
            break;
          case "game.playCard":
            await params.roomService.playCard(meta.token, msg.data.cardId, {
              chosenColor: msg.data.chosenColor,
              declareUno: msg.data.declareUno,
            });
            break;
          case "game.draw":
            await params.roomService.draw(meta.token);
            break;
          case "game.pass":
            await params.roomService.pass(meta.token);
            break;
          case "game.uno":
            await params.roomService.uno(meta.token);
            break;
          case "game.action":
            await params.roomService.applyGameAction(meta.token, msg.data.action);
            break;
          default:
            break;
        }
      } catch (e) {
        params.hub.handleAppError(ws, e);
      }
    });

    ws.on("close", () => {
      void params.hub.disconnect(ws);
    });
  });

  return wss;
}
