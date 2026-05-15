import WebSocket from "ws";
import { AppError } from "../../application/errors.js";
import { RoomService, clientRoomView } from "../../application/roomService.js";

type SocketMeta = {
  roomId: string;
  playerId: string;
  token: string;
};

export class WsHub {
  private readonly sockets = new Map<WebSocket, SocketMeta>();
  private readonly byRoom = new Map<string, Set<WebSocket>>();

  constructor(private readonly rooms: RoomService) {}

  getMeta(ws: WebSocket): SocketMeta | undefined {
    return this.sockets.get(ws);
  }

  private addToRoom(roomId: string, ws: WebSocket) {
    let set = this.byRoom.get(roomId);
    if (!set) {
      set = new Set();
      this.byRoom.set(roomId, set);
    }
    set.add(ws);
  }

  private removeFromRoom(roomId: string, ws: WebSocket) {
    this.byRoom.get(roomId)?.delete(ws);
  }

  async authenticate(ws: WebSocket, token: string): Promise<boolean> {
    const sess = await this.rooms.session(token);
    if (!sess) return false;
    
    // Check if the player still exists in the room
    const state = await this.rooms.getLive(sess.roomId);
    if (!state) return false;
    const playerExists = state.players.some((p) => p.id === sess.playerId);
    if (!playerExists) return false;
    
    const meta: SocketMeta = { roomId: sess.roomId, playerId: sess.playerId, token };
    this.sockets.set(ws, meta);
    this.addToRoom(sess.roomId, ws);
    await this.rooms.setConnected(sess.roomId, sess.playerId, true);
    return true;
  }

  async disconnect(ws: WebSocket) {
    const meta = this.sockets.get(ws);
    if (!meta) return;
    this.sockets.delete(ws);
    this.removeFromRoom(meta.roomId, ws);
    await this.rooms.handleDisconnect(meta.roomId, meta.playerId);
  }

  pushRoom(roomId: string) {
    const set = this.byRoom.get(roomId);
    if (!set) return;
    void this.rooms.getLive(roomId).then((state) => {
      if (!state) return;
      const payload = (playerId: string) => clientRoomView(state, playerId);
      for (const ws of set) {
        const m = this.sockets.get(ws);
        if (!m) continue;
        if (ws.readyState !== WebSocket.OPEN) continue;
        ws.send(JSON.stringify(payload(m.playerId)));
      }
    });
  }

  broadcastEvent(roomId: string, event: Record<string, unknown>, except?: WebSocket) {
    const set = this.byRoom.get(roomId);
    if (!set) return;
    const raw = JSON.stringify(event);
    for (const ws of set) {
      if (except && ws === except) continue;
      if (ws.readyState !== WebSocket.OPEN) continue;
      ws.send(raw);
    }
  }

  closeRoom(roomId: string) {
    const set = this.byRoom.get(roomId);
    if (!set) return;
    const event = JSON.stringify({ type: "room.closed", message: "اتاق توسط میزبان بسته شد" });
    for (const ws of set) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      ws.send(event);
      ws.close();
    }
    this.byRoom.delete(roomId);
  }

  sendError(ws: WebSocket, code: string, message: string) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "error", code, message }));
  }

  handleAppError(ws: WebSocket, e: unknown) {
    if (e instanceof AppError) {
      this.sendError(ws, e.code, e.message);
      return;
    }
    console.error(e);
    this.sendError(ws, "internal", "خطای داخلی");
  }
}
