import {
  startNewGame,
  playCard,
  drawCard,
  passAfterDraw,
  callUno,
} from "../domain/uno/gameEngine.js";
import { RoomRepository } from "../infrastructure/mongo/roomRepository.js";
import { LiveRoomStore } from "../infrastructure/redis/liveRoomStore.js";
import { SessionStore } from "../infrastructure/redis/sessionStore.js";
import { projectGameStateForPlayer } from "./gameProjection.js";
import type { LiveRoomState } from "./liveRoomState.js";
import { generateRoomCode } from "./roomCode.js";
import type { LobbyPlayer, RoomSettings } from "./roomTypes.js";
import { AppError } from "./errors.js";
import { newPlayerId, newPlayerToken, type SessionPayload } from "./session.js";
import { cardMatchesTop, isWild, type UnoCard } from "../domain/uno/card.js";
import { AVATAR_OPTIONS } from "../constant/avatar.cons.js";

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

export type BotMatchResult = CreateRoomResult;

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
  private readonly botTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly botNames = [
    "آوا",
    "پارسا",
    "نیما",
    "ترانه",
    "آرین",
    "هلیا",
    "مانی",
    "دینا",
    "سروش",
    "روژین",
  ];
  private readonly botAvatars = AVATAR_OPTIONS;

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
    this.scheduleBotTurn(state.id);
  }

  private clearBotTimer(roomId: string): void {
    const pending = this.botTurnTimers.get(roomId);
    if (pending) clearTimeout(pending);
    this.botTurnTimers.delete(roomId);
  }

  private chooseBotCard(state: NonNullable<LiveRoomState["game"]>, playerId: string): UnoCard | null {
    const hand = state.hands[playerId] ?? [];
    const top = state.discardPile[state.discardPile.length - 1];
    if (!top) return null;
    const legal = hand.filter((c) => cardMatchesTop(c, top, state.currentColor));
    if (!legal.length) return null;

    legal.sort((a, b) => {
      const aWild = isWild(a) ? 1 : 0;
      const bWild = isWild(b) ? 1 : 0;
      if (aWild !== bWild) return aWild - bWild;
      if (a.rank === "skip" || a.rank === "reverse" || a.rank === "draw2") return -1;
      if (b.rank === "skip" || b.rank === "reverse" || b.rank === "draw2") return 1;
      return 0;
    });

    const idx = Math.min(legal.length - 1, Math.floor(Math.random() * Math.min(2, legal.length)));
    return legal[idx] ?? legal[0] ?? null;
  }

  private chooseWildColor(state: NonNullable<LiveRoomState["game"]>, playerId: string): "red" | "yellow" | "green" | "blue" {
    const hand = state.hands[playerId] ?? [];
    const counts: Record<"red" | "yellow" | "green" | "blue", number> = {
      red: 0,
      yellow: 0,
      green: 0,
      blue: 0,
    };
    for (const c of hand) {
      if (c.color === "black") continue;
      counts[c.color] += 1;
    }
    return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as "red" | "yellow" | "green" | "blue") ?? "red";
  }

  private scheduleBotTurn(roomId: string): void {
    this.clearBotTimer(roomId);
    void (async () => {
      const state = await this.live.load(roomId);
      if (!state || state.phase !== "playing" || !state.game) return;
      const game = state.game;
      const active = game.players[game.turnIndex];
      if (!active) return;
      const lobbyPlayer = state.players.find((p) => p.id === active.id);
      if (!lobbyPlayer?.isBot) return;

      const base = state.settings.mode === "fast" ? 700 : 1100;
      const extra = state.settings.mode === "fast" ? 1600 : 2800;
      const delayMs = base + Math.floor(Math.random() * extra);
      const lockedVersion = state.version;

      const timer = setTimeout(() => {
        void this.runBotTurn(roomId, active.id, lockedVersion);
      }, delayMs);

      this.botTurnTimers.set(roomId, timer);
    })();
  }

  private async runBotTurn(roomId: string, botId: string, expectedVersion: number): Promise<void> {
    this.botTurnTimers.delete(roomId);
    const state = await this.live.load(roomId);
    if (!state || state.phase !== "playing" || !state.game) return;
    if (state.version !== expectedVersion) return;
    const game = state.game;
    const active = game.players[game.turnIndex];
    if (!active || active.id !== botId) return;
    const lobby = state.players.find((p) => p.id === botId);
    if (!lobby?.isBot) return;

    const picked = this.chooseBotCard(game, botId);
    if (picked) {
      const shouldSayUno = (game.hands[botId]?.length ?? 0) === 2 && Math.random() > 0.12;
      const res = playCard(game, botId, picked.id, {
        chosenColor: picked.color === "black" ? this.chooseWildColor(game, botId) : undefined,
        declareUno: shouldSayUno,
      });
      if (!res.ok) return;
      if (shouldSayUno) this.emitUnoDeclared(state, botId);
      if (game.status === "finished") state.phase = "finished";
      this.bump(state);
      await this.persist(state);
      return;
    }

    const drawRes = drawCard(game, botId);
    if (!drawRes.ok) return;
    const afterDraw = this.chooseBotCard(game, botId);
    const shouldPlayAfterDraw = !!afterDraw && Math.random() > 0.38;
    if (shouldPlayAfterDraw && afterDraw) {
      const shouldSayUno = (game.hands[botId]?.length ?? 0) === 2 && Math.random() > 0.12;
      const playRes = playCard(game, botId, afterDraw.id, {
        chosenColor: afterDraw.color === "black" ? this.chooseWildColor(game, botId) : undefined,
        declareUno: shouldSayUno,
      });
      if (!playRes.ok) return;
      if (shouldSayUno) this.emitUnoDeclared(state, botId);
      if (game.status === "finished") state.phase = "finished";
      this.bump(state);
      await this.persist(state);
      return;
    }

    const passRes = passAfterDraw(game, botId);
    if (!passRes.ok) return;
    this.bump(state);
    await this.persist(state);
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

  async createRoom(hostDisplayName: string, avatar: string | undefined, input: Partial<RoomSettings> & { name: string }): Promise<CreateRoomResult> {
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
      avatar,
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

  async joinRoom(codeRaw: string, displayName: string, avatar?: string): Promise<JoinRoomResult> {
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
      avatar,
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
    avatar?: string,
  ): Promise<(CreateRoomResult | JoinRoomResult) & { created: boolean }> {
    const open = await this.listPublicRooms();
    if (open.length > 0) {
      const joined = await this.joinRoom(open[0]!.code, displayName, avatar);
      return { ...joined, created: false };
    }

    const created = await this.createRoom(displayName, avatar, {
      name: "بازی سریع",
      maxPlayers: 4,
      mode: "fast",
      isPrivate: false,
    });
    return { ...created, created: true };
  }

  async createBotMatch(displayName: string, totalPlayers: number, avatar?: string): Promise<BotMatchResult> {
    if (totalPlayers < 2 || totalPlayers > 4) {
      throw new AppError("تعداد بازیکن باید بین ۲ تا ۴ باشد", "bad_settings");
    }

    const created = await this.createRoom(displayName, avatar, {
      name: "بازی با بات",
      maxPlayers: totalPlayers,
      mode: "classic",
      isPrivate: true,
    });

    const state = await this.live.load(created.roomId);
    if (!state) throw new AppError("اتاق پیدا نشد", "not_found", 404);

    const existing = new Set(state.players.map((p) => p.displayName));
    const botsNeeded = totalPlayers - 1;
    for (let i = 0; i < botsNeeded; i++) {
      const botId = newPlayerId();
      let baseName = this.botNames[Math.floor(Math.random() * this.botNames.length)] ?? `Bot${i + 1}`;
      while (existing.has(baseName)) {
        baseName = `${baseName}${Math.floor(10 + Math.random() * 90)}`;
      }
      existing.add(baseName);
      state.players.push({
        id: botId,
        displayName: baseName,
        avatar: this.botAvatars[i % this.botAvatars.length],
        isHost: false,
        isBot: true,
        ready: true,
        connected: true,
      });
    }
    this.bump(state);
    await this.persist(state);
    await this.startGame(created.playerToken);

    return created;
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

//   private async destroyRoom(roomId: string): Promise<void> {
//     const state = await this.live.load(roomId);
//     if (!state) return;

//     // Remove from public lobby index
//     await this.live.removeFromPublicLobbyIndex(roomId);
    
//     // Delete the room from Redis
//     await this.live.delete(roomId);

//     // Notify all connected clients that the room is destroyed
//     this.events.onRoomDestroyed?.(roomId);
//   }

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

    const roster = state.players.map((p) => ({ id: p.id, displayName: p.displayName, avatar: p.avatar }));
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

