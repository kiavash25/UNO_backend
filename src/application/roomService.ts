import { startNewGame, playCard, drawCard, passAfterDraw, callUno } from "../domain/uno/gameEngine.js";
import { RoomRepository } from "../infrastructure/mongo/roomRepository.js";
import { LiveRoomStore } from "../infrastructure/redis/liveRoomStore.js";
import { SessionStore } from "../infrastructure/redis/sessionStore.js";
import { projectGameStateForPlayer } from "./gameProjection.js";
import type { LiveRoomState } from "./liveRoomState.js";
import { generateRoomCode } from "./roomCode.js";
import type { LobbyPlayer, RoomSettings } from "./roomTypes.js";
import { AppError } from "./errors.js";
import { newPlayerId, newPlayerToken, type SessionPayload } from "./session.js";

export type CreateRoomResult = {
  roomId: string;
  code: string;
  playerToken: string;
  playerId: string;
};

export type JoinRoomResult = {
  roomId: string;
  code: string;
  playerToken: string;
  playerId: string;
};

export type PublicRoomSummary = {
  code: string;
  name: string;
  maxPlayers: number;
  currentPlayers: number;
  phase: LiveRoomState["phase"];
  mode: RoomSettings["mode"];
  isPrivate: boolean;
};

export type RoomEvents = {
  onRoomChanged?: (roomId: string) => void;
  onUnoDeclared?: (roomId: string, playerId: string, displayName: string) => void;
  onRoomDestroyed?: (roomId: string) => void;
};

export class RoomService {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly live: LiveRoomStore,
    private readonly sessions: SessionStore,
    private readonly events: RoomEvents = {},
  ) {}

  private bump(state: LiveRoomState): void {
    state.version += 1;
  }

  private async persist(state: LiveRoomState): Promise<void> {
    await this.live.save(state);
    this.events.onRoomChanged?.(state.id);
  }

  private defaultSettings(partial: Partial<RoomSettings> & Pick<RoomSettings, "name">): RoomSettings {
    return {
      name: partial.name,
      maxPlayers: partial.maxPlayers ?? 4,
      mode: partial.mode ?? "classic",
      isPrivate: partial.isPrivate ?? true,
      turnTimeoutSec: partial.mode === "fast" ? 30 : 120,
    };
  }

  async createRoom(hostDisplayName: string, input: Partial<RoomSettings> & { name: string }): Promise<CreateRoomResult> {
    const settings = this.defaultSettings(input);
    if (settings.maxPlayers < 2 || settings.maxPlayers > 10) {
      throw new AppError("حداکثر بازیکن باید بین ۲ تا ۱۰ باشد", "bad_settings");
    }

    const hostId = newPlayerId();
    let code = generateRoomCode();
    for (let attempt = 0; attempt < 15; attempt++) {
      const exists = await this.rooms.findByCode(code);
      if (!exists) break;
      code = generateRoomCode();
    }

    const mongo = await this.rooms.create({ code, hostPlayerId: hostId, settings });
    const roomId = String(mongo._id);

    const host: LobbyPlayer = {
      id: hostId,
      displayName: hostDisplayName,
      isHost: true,
      ready: true,
      connected: false,
    };

    const state: LiveRoomState = {
      id: roomId,
      code,
      settings,
      hostId,
      players: [host],
      phase: "lobby",
      game: null,
      version: 1,
    };

    const playerToken = newPlayerToken();
    await this.persist(state);
    await this.sessions.save(playerToken, { roomId, playerId: hostId });

    return { roomId, code, playerToken, playerId: hostId };
  }

  async joinRoom(codeRaw: string, displayName: string): Promise<JoinRoomResult> {
    const code = codeRaw.toUpperCase();
    let roomId = await this.live.findRoomIdByCode(code);
    if (!roomId) {
      const mongo = await this.rooms.findByCode(code);
      if (!mongo) throw new AppError("اتاق پیدا نشد", "not_found", 404);
      roomId = String(mongo._id);
    }

    const state = await this.live.load(roomId);
    if (!state) throw new AppError("اتاق دیگر فعال نیست", "gone", 410);

    if (state.players.length >= state.settings.maxPlayers) {
      throw new AppError("اتاق پر است", "full", 409);
    }

    const playerId = newPlayerId();
    const player: LobbyPlayer = {
      id: playerId,
      displayName,
      isHost: false,
      ready: false,
      connected: false,
    };

    state.players.push(player);
    this.bump(state);
    const playerToken = newPlayerToken();
    await this.persist(state);
    await this.sessions.save(playerToken, { roomId, playerId });

    return { roomId, code: state.code, playerToken, playerId };
  }

  async session(token: string): Promise<SessionPayload | null> {
    return this.sessions.get(token);
  }

  async getLive(roomId: string): Promise<LiveRoomState | null> {
    return this.live.load(roomId);
  }

  async listPublicRooms(): Promise<PublicRoomSummary[]> {
    const ids = await this.live.listPublicLobbyRoomIds();
    const results: PublicRoomSummary[] = [];

    for (const id of ids) {
      const state = await this.live.load(id);
      if (!state) {
        await this.live.removeFromPublicLobbyIndex(id);
        continue;
      }
      if (state.settings.isPrivate || state.phase !== "lobby") continue;
      if (state.players.length >= state.settings.maxPlayers) continue;

      results.push({
        code: state.code,
        name: state.settings.name,
        maxPlayers: state.settings.maxPlayers,
        currentPlayers: state.players.length,
        phase: state.phase,
        mode: state.settings.mode,
        isPrivate: false,
      });
    }

    return results.sort((a, b) => b.currentPlayers - a.currentPlayers);
  }

  async quickPlay(
    displayName: string,
  ): Promise<(CreateRoomResult | JoinRoomResult) & { created: boolean }> {
    const open = await this.listPublicRooms();
    if (open.length > 0) {
      const joined = await this.joinRoom(open[0]!.code, displayName);
      return { ...joined, created: false };
    }

    const created = await this.createRoom(displayName, {
      name: "بازی سریع",
      maxPlayers: 4,
      mode: "fast",
      isPrivate: false,
    });
    return { ...created, created: true };
  }

  /** اطلاعات عمومی اتاق برای لندینگ / بررسی قبل از ورود (بدون توکن). */
  async getPublicByCode(code: string): Promise<PublicRoomSummary | null> {
    const upper = code.toUpperCase();
    let roomId = await this.live.findRoomIdByCode(upper);
    if (!roomId) {
      const mongo = await this.rooms.findByCode(upper);
      if (!mongo) return null;
      roomId = String(mongo._id);
    }

    const live = await this.live.load(roomId);
    if (!live) return null;

    return {
      code: live.code,
      name: live.settings.name,
      maxPlayers: live.settings.maxPlayers,
      currentPlayers: live.players.length,
      phase: live.phase,
      mode: live.settings.mode,
      isPrivate: live.settings.isPrivate,
    };
  }

  private emitUnoDeclared(state: LiveRoomState, playerId: string): void {
    const lobby = state.players.find((p) => p.id === playerId);
    this.events.onUnoDeclared?.(state.id, playerId, lobby?.displayName ?? "بازیکن");
  }

  async setConnected(roomId: string, playerId: string, connected: boolean): Promise<void> {
    const state = await this.live.load(roomId);
    if (!state) return;
    const p = state.players.find((x) => x.id === playerId);
    if (!p) return;
    if (p.connected === connected) return;
    p.connected = connected;
    this.bump(state);
    await this.persist(state);
  }

  async handleDisconnect(roomId: string, playerId: string): Promise<void> {
    const state = await this.live.load(roomId);
    if (!state) return;

    const p = state.players.find((x) => x.id === playerId);
    if (!p) return;
    if (p.connected === false) return;
    p.connected = false;
    this.bump(state);
    await this.persist(state);
  }

  private async destroyRoom(roomId: string): Promise<void> {
    const state = await this.live.load(roomId);
    if (!state) return;

    // Remove from public lobby index
    await this.live.removeFromPublicLobbyIndex(roomId);
    
    // Delete the room from Redis
    await this.live.delete(roomId);

    // Notify all connected clients that the room is destroyed
    this.events.onRoomDestroyed?.(roomId);
  }

  async setReady(token: string, ready: boolean): Promise<void> {
    const sess = await this.sessions.get(token);
    if (!sess) throw new AppError("نشست نامعتبر است", "unauthorized", 401);

    const state = await this.live.load(sess.roomId);
    if (!state) throw new AppError("اتاق پیدا نشد", "not_found", 404);

    const p = state.players.find((x) => x.id === sess.playerId);
    if (!p) throw new AppError("بازیکن پیدا نشد", "not_found", 404);

    p.ready = ready;
    this.bump(state);
    await this.persist(state);
  }

  async startGame(token: string): Promise<void> {
    const sess = await this.sessions.get(token);
    if (!sess) throw new AppError("نشست نامعتبر است", "unauthorized", 401);

    const state = await this.live.load(sess.roomId);
    if (!state) throw new AppError("اتاق پیدا نشد", "not_found", 404);

    if (state.hostId !== sess.playerId) {
      throw new AppError("فقط میزبان می‌تواند بازی را شروع کند", "forbidden", 403);
    }

    if (state.phase !== "lobby") throw new AppError("بازی از قبل شروع شده", "bad_phase");

    if (state.players.length < 2) throw new AppError("حداقل دو بازیکن لازم است", "not_enough");

    const notReady = state.players.filter((p) => !p.ready);
    if (notReady.length) throw new AppError("همه باید آماده باشند", "not_ready");

    const roster = state.players.map((p) => ({ id: p.id, displayName: p.displayName }));
    const game = startNewGame(roster);
    state.game = game;
    state.phase = "playing";
    this.bump(state);
    await this.persist(state);
  }

  async playCard(
    token: string,
    cardId: string,
    opts?: { chosenColor?: "red" | "yellow" | "green" | "blue"; declareUno?: boolean },
  ): Promise<void> {
    const sess = await this.requirePlayingSession(token);
    const state = sess.state;
    const game = state.game;
    if (!game) throw new AppError("بازی فعال نیست", "bad_phase");

    const res = playCard(game, sess.playerId, cardId, opts);
    if (!res.ok) throw new AppError(res.message, res.code);

    if (opts?.declareUno) {
      const pub = game.players.find((p) => p.id === sess.playerId);
      if (pub?.saidUno) this.emitUnoDeclared(state, sess.playerId);
    }

    if (game.status === "finished") state.phase = "finished";
    this.bump(state);
    await this.persist(state);
  }

  async draw(token: string): Promise<void> {
    const sess = await this.requirePlayingSession(token);
    const state = sess.state;
    const game = state.game;
    if (!game) throw new AppError("بازی فعال نیست", "bad_phase");

    const res = drawCard(game, sess.playerId);
    if (!res.ok) throw new AppError(res.message, res.code);

    this.bump(state);
    await this.persist(state);
  }

  async pass(token: string): Promise<void> {
    const sess = await this.requirePlayingSession(token);
    const state = sess.state;
    const game = state.game;
    if (!game) throw new AppError("بازی فعال نیست", "bad_phase");

    const res = passAfterDraw(game, sess.playerId);
    if (!res.ok) throw new AppError(res.message, res.code);

    this.bump(state);
    await this.persist(state);
  }

  async uno(token: string): Promise<void> {
    const sess = await this.requirePlayingSession(token);
    const state = sess.state;
    const game = state.game;
    if (!game) throw new AppError("بازی فعال نیست", "bad_phase");

    const res = callUno(game, sess.playerId);
    if (!res.ok) throw new AppError(res.message, res.code);

    this.emitUnoDeclared(state, sess.playerId);
    this.bump(state);
    await this.persist(state);
  }

  private async requirePlayingSession(token: string): Promise<{ state: LiveRoomState; playerId: string }> {
    const sess = await this.sessions.get(token);
    if (!sess) throw new AppError("نشست نامعتبر است", "unauthorized", 401);

    const state = await this.live.load(sess.roomId);
    if (!state) throw new AppError("اتاق پیدا نشد", "not_found", 404);

    if (state.phase !== "playing") throw new AppError("بازی در جریان نیست", "bad_phase");

    return { state, playerId: sess.playerId };
  }
}

export function clientRoomView(state: LiveRoomState, viewerId: string) {
  return {
    type: "room.state" as const,
    version: state.version,
    phase: state.phase,
    code: state.code,
    settings: state.settings,
    players: state.players,
    game: state.game ? projectGameStateForPlayer(state.game, viewerId) : null,
  };
}
