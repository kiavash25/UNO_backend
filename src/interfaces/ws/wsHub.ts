import WebSocket from "ws";
import { AppError } from "../../application/errors.js";
import { RoomService, clientRoomView } from "../../application/roomService.js";

export type SocketMeta = {
  roomId: string;
  playerId: string;
  token: string;
};

export class WsHub {
  private readonly sockets = new Map<WebSocket, SocketMeta>();
  private readonly byRoom = new Map<string, Set<WebSocket>>();
  private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly disconnectGraceMs = 4_000;

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

  private playerKey(roomId: string, playerId: string): string {
    return `${roomId}:${playerId}`;
  }

  private clearDisconnectTimer(roomId: string, playerId: string): void {
    const key = this.playerKey(roomId, playerId);
    const timer = this.disconnectTimers.get(key);
    if (timer) clearTimeout(timer);
    this.disconnectTimers.delete(key);
  }

  private hasOpenPlayerSocket(roomId: string, playerId: string): boolean {
    const set = this.byRoom.get(roomId);
    if (!set) return false;
    for (const ws of set) {
      const meta = this.sockets.get(ws);
      if (!meta || meta.playerId !== playerId) continue;
      if (ws.readyState === WebSocket.OPEN) return true;
    }
    return false;
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
    this.clearDisconnectTimer(sess.roomId, sess.playerId);
    await this.rooms.setConnected(sess.roomId, sess.playerId, true);
    this.pushRoom(sess.roomId);
    return true;
  }

  async disconnect(ws: WebSocket) {
    const meta = this.sockets.get(ws);
    if (!meta) return;
    this.sockets.delete(ws);
    this.removeFromRoom(meta.roomId, ws);
    if (this.hasOpenPlayerSocket(meta.roomId, meta.playerId)) return;
    await this.rooms.handleDisconnect(meta.roomId, meta.playerId);
    this.pushRoom(meta.roomId);

    const key = this.playerKey(meta.roomId, meta.playerId);
    this.clearDisconnectTimer(meta.roomId, meta.playerId);
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(key);
      if (this.hasOpenPlayerSocket(meta.roomId, meta.playerId)) return;
      void this.rooms.eliminateDisconnectedPlayer(meta.roomId, meta.playerId);
    }, this.disconnectGraceMs);
    this.disconnectTimers.set(key, timer);
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
