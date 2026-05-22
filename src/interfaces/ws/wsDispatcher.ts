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
    case "game.playCard":
      await deps.roomService.playCard(meta.token, msg.cardId, {
        chosenColor: msg.chosenColor,
        declareUno: msg.declareUno,
      });
      break;
    case "game.draw":
      await deps.roomService.draw(meta.token);
      break;
    case "game.pass":
      await deps.roomService.pass(meta.token);
      break;
    case "game.uno":
      await deps.roomService.uno(meta.token);
      break;
    case "game.action":
      await deps.roomService.applyGameAction(meta.token, msg.action as CardGameAction);
      break;
  }
}

