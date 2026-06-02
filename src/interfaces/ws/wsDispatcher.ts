import type { CardGameAction } from "../../domain/cardGame/cardGame.js";
import type { RoomService } from "../../application/roomService.js";
import type { ClientMessage } from "./wsMessages.js";
import type { SocketMeta, WsHub } from "./wsHub.js";

export type WsDispatchDeps = {
  roomService: RoomService;
  hub: WsHub;
};

export async function dispatchWsMessage(
  deps: WsDispatchDeps,
  meta: SocketMeta,
  msg: ClientMessage,
): Promise<void> {
  switch (msg.type) {
    case "lobby.ready":
      await deps.roomService.setReady(meta.token, msg.ready);
      break;
    case "lobby.chat":
      await deps.roomService.recordChat(meta.roomId, meta.playerId, msg.text, msg.emoji);
      deps.hub.broadcastEvent(meta.roomId, {
        type: "lobby.chat",
        fromPlayerId: meta.playerId,
        text: msg.text,
        emoji: msg.emoji,
        ts: Date.now(),
      });
      break;
    case "game.start":
      await deps.roomService.startGame(meta.token);
      break;
    case "game.action":
      await deps.roomService.applyGameAction(meta.token, msg.action as CardGameAction);
      break;
  }
}
