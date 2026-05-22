import type { IncomingMessage } from "http";
import type { WebSocket } from "ws";
import type { RoomService } from "../../application/roomService.js";
import { authMessageSchema, clientMessageSchema } from "./wsMessages.js";
import { dispatchWsMessage } from "./wsDispatcher.js";
import type { WsHub } from "./wsHub.js";

export type WsConnectionDeps = {
  roomService: RoomService;
  hub: WsHub;
};

function parseJson(raw: WebSocket.RawData): unknown {
  return JSON.parse(raw.toString());
}

async function authenticateFirstMessage(deps: WsConnectionDeps, ws: WebSocket, parsed: unknown): Promise<boolean> {
  const first = authMessageSchema.safeParse(parsed);
  if (!first.success) {
    deps.hub.sendError(ws, "auth", "ابتدا پیام auth بفرستید");
    return false;
  }

  const ok = await deps.hub.authenticate(ws, first.data.token);
  if (!ok) {
    deps.hub.sendError(ws, "auth", "توکن نامعتبر است");
    ws.close();
    return false;
  }

  const meta = deps.hub.getMeta(ws);
  if (meta) {
    ws.send(
      JSON.stringify({
        type: "authenticated",
        roomId: meta.roomId,
        playerId: meta.playerId,
      }),
    );
  }
  return true;
}

export function createWsConnectionHandler(deps: WsConnectionDeps) {
  return (ws: WebSocket, _req: IncomingMessage) => {
    let authed = false;

    ws.on("message", async (data) => {
      let parsed: unknown;
      try {
        parsed = parseJson(data);
      } catch {
        deps.hub.sendError(ws, "parse", "پیام JSON نیست");
        return;
      }

      if (!authed) {
        authed = await authenticateFirstMessage(deps, ws, parsed);
        return;
      }

      const msg = clientMessageSchema.safeParse(parsed);
      if (!msg.success) {
        deps.hub.sendError(ws, "validation", "ساختار پیام نامعتبر است");
        return;
      }

      const meta = deps.hub.getMeta(ws);
      if (!meta) {
        deps.hub.sendError(ws, "internal", "متای سوکت گم شده");
        return;
      }

      try {
        await dispatchWsMessage(deps, meta, msg.data);
      } catch (e) {
        deps.hub.handleAppError(ws, e);
      }
    });

    ws.on("close", () => {
      void deps.hub.disconnect(ws);
    });
  };
}

