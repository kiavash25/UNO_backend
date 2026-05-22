import { WebSocketServer } from "ws";
import { RoomService } from "../../application/roomService.js";
import { createWsConnectionHandler } from "./wsConnection.js";
import { WsHub } from "./wsHub.js";

export function attachWsServer(params: { server: import("http").Server; roomService: RoomService; hub: WsHub }) {
  const wss = new WebSocketServer({ server: params.server, path: "/ws" });
  wss.on("connection", createWsConnectionHandler(params));
  return wss;
}

