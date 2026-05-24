import type { CardGameAction, CardGameDefinition, CardGameEvent } from "../domain/cardGame/cardGame.js";
import { getCardGame } from "../domain/cardGame/gameRegistry.js";
import { RoomRepository } from "../infrastructure/mongo/roomRepository.js";
import { LiveRoomStore } from "../infrastructure/redis/liveRoomStore.js";
import { SessionStore } from "../infrastructure/redis/sessionStore.js";
import type { LiveRoomState } from "./liveRoomState.js";
import { generateRoomCode } from "./roomCode.js";
import type { LobbyPlayer, RoomSettings } from "./roomTypes.js";
import { AppError } from "./errors.js";
import { newPlayerId, newPlayerToken, type SessionPayload } from "./session.js";
import { BotProfileService } from "./bots/botProfiles.js";

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

export type ClaimedMatchResult = {
  won: boolean;
  gameId: string;
};

export type PublicRoomSummary = {
  code: string;
  gameId: string;
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
  onGameEvent?: (roomId: string, event: CardGameEvent) => void;
  onRoomDestroyed?: (roomId: string) => void;
};

export class RoomService {
  private readonly botTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly turnTimeoutMs = 10_000;

  constructor(
    private readonly rooms: RoomRepository,
    private readonly live: LiveRoomStore,
    private readonly sessions: SessionStore,
    private readonly events: RoomEvents = {},
    private readonly botProfiles = new BotProfileService(),
  ) {}

  private bump(state: LiveRoomState): void {
    state.version += 1;
  }

  private async persist(state: LiveRoomState, opts: { resetTurnTimer?: boolean } = {}): Promise<void> {
    if (opts.resetTurnTimer || (state.phase === "playing" && !state.turnDeadlineAt)) {
      this.resetTurnDeadline(state);
    }
    if (state.phase !== "playing") {
      state.turnDeadlineAt = null;
    }
    await this.live.save(state);
    this.events.onRoomChanged?.(state.id);
    this.scheduleTurnTimeout(state.id);
    this.scheduleBotTurn(state.id);
  }

  private resetTurnDeadline(state: LiveRoomState): void {
    const game = state.game ? this.gameForRoom(state) : null;
    const activePlayerId = state.game && game ? game.getActivePlayerId(state.game) : null;
    state.turnDeadlineAt = state.phase === "playing" && activePlayerId ? Date.now() + this.turnTimeoutMs : null;
  }

  private gameDefinition(gameId: string): CardGameDefinition {
    const game = getCardGame(gameId);
    if (!game) throw new AppError("این بازی پشتیبانی نمی‌شود", "unsupported_game", 400);
    return game;
  }

  private gameForRoom(state: LiveRoomState): CardGameDefinition {
    return this.gameDefinition(state.settings.gameId ?? "uno");
  }

  private clearBotTimer(roomId: string): void {
    const pending = this.botTurnTimers.get(roomId);
    if (pending) clearTimeout(pending);
    this.botTurnTimers.delete(roomId);
  }

  private clearTurnTimer(roomId: string): void {
    const pending = this.turnTimers.get(roomId);
    if (pending) clearTimeout(pending);
    this.turnTimers.delete(roomId);
  }

  private scheduleTurnTimeout(roomId: string): void {
    this.clearTurnTimer(roomId);
    void (async () => {
      const state = await this.live.load(roomId);
      if (!state || state.phase !== "playing" || !state.game || !state.turnDeadlineAt) return;
      const game = this.gameForRoom(state);
      const activePlayerId = game.getActivePlayerId(state.game);
      if (!activePlayerId || !game.handleTurnTimeout) return;
      const deadline = state.turnDeadlineAt;
      const delayMs = Math.max(0, deadline - Date.now());
      const timer = setTimeout(() => {
        void this.runTurnTimeout(roomId, activePlayerId, deadline);
      }, delayMs);
      this.turnTimers.set(roomId, timer);
    })();
  }

  private async runTurnTimeout(roomId: string, playerId: string, expectedDeadline: number): Promise<void> {
    this.turnTimers.delete(roomId);
    const state = await this.live.load(roomId);
    if (!state || state.phase !== "playing" || !state.game) return;
    if (state.turnDeadlineAt !== expectedDeadline || Date.now() < expectedDeadline) return;
    const game = this.gameForRoom(state);
    if (game.getActivePlayerId(state.game) !== playerId || !game.handleTurnTimeout) return;

    const result = game.handleTurnTimeout(state.game, playerId);
    if (!result.ok) return;

    const eliminated = result.events?.some((event) => event.type === "uno.playerEliminated") ?? false;
    this.handleGameEvents(state, [
      ...(result.events ?? []),
      ...(eliminated ? [] : [{ type: "game.turnTimedOut", payload: { playerId, penaltyCards: 1 } }]),
    ]);
    if (game.isFinished(state.game)) state.phase = "finished";
    this.bump(state);
    await this.persist(state, { resetTurnTimer: true });
  }

  private scheduleBotTurn(roomId: string): void {
    this.clearBotTimer(roomId);
    void (async () => {
      const state = await this.live.load(roomId);
      if (!state || state.phase !== "playing" || !state.game) return;
      const game = this.gameForRoom(state);
      const activePlayerId = game.getActivePlayerId(state.game);
      if (!activePlayerId) return;
      const lobbyPlayer = state.players.find((p) => p.id === activePlayerId);
      if (!lobbyPlayer?.isBot) return;

      const base = state.settings.mode === "fast" ? 700 : 1100;
      const extra = state.settings.mode === "fast" ? 1600 : 2800;
      const delayMs = base + Math.floor(Math.random() * extra);
      const lockedVersion = state.version;

      const timer = setTimeout(() => {
        void this.runBotTurn(roomId, activePlayerId, lockedVersion);
      }, delayMs);

      this.botTurnTimers.set(roomId, timer);
    })();
  }

  private async runBotTurn(roomId: string, botId: string, expectedVersion: number): Promise<void> {
    this.botTurnTimers.delete(roomId);
    const state = await this.live.load(roomId);
    if (!state || state.phase !== "playing" || !state.game) return;
    if (state.version !== expectedVersion) return;
    const game = this.gameForRoom(state);
    if (game.getActivePlayerId(state.game) !== botId) return;
    const lobby = state.players.find((p) => p.id === botId);
    if (!lobby?.isBot) return;

    const action = game.chooseBotAction?.(state.game, botId, {
      settings: state.settings,
      lobbyPlayers: state.players,
    });
    if (!action) return;

    const result = game.applyAction(state.game, botId, action);
    if (!result.ok) return;

    this.handleGameEvents(state, result.events);
    if (game.isFinished(state.game)) state.phase = "finished";
    this.bump(state);
    await this.persist(state, { resetTurnTimer: true });
  }

  private defaultSettings(partial: Partial<RoomSettings> & Pick<RoomSettings, "name">): RoomSettings {
    const gameId = partial.gameId ?? "uno";
    const game = this.gameDefinition(gameId);
    return {
      gameId,
      name: partial.name,
      maxPlayers: partial.maxPlayers ?? Math.min(4, game.maxPlayers),
      mode: partial.mode ?? "classic",
      isPrivate: partial.isPrivate ?? true,
      turnTimeoutSec: 10,
    };
  }

  async createRoom(hostDisplayName: string, avatar: string | undefined, input: Partial<RoomSettings> & { name: string }, userId?: string): Promise<CreateRoomResult> {
    const settings = this.defaultSettings(input);
    const game = this.gameDefinition(settings.gameId);
    if (settings.maxPlayers < game.minPlayers || settings.maxPlayers > game.maxPlayers) {
      throw new AppError(`تعداد بازیکن برای ${game.displayName} باید بین ${game.minPlayers} تا ${game.maxPlayers} باشد`, "bad_settings");
    }

    const hostId = newPlayerId();
    let code = generateRoomCode();
    for (let attempt = 0; attempt < 15; attempt++) {
      const exists = await this.rooms.findByCode(code);
      if (!exists) break;
      code = generateRoomCode();
    }
    if (settings.name === "__ROOM_CODE__") {
      settings.name = code;
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
      turnDeadlineAt: null,
      matchRewardsClaimed: {},
      version: 1,
    };

    const playerToken = newPlayerToken();
    await this.persist(state);
    await this.sessions.save(playerToken, { roomId, playerId: hostId, userId });

    return { roomId, code, playerToken, playerId: hostId };
  }

  async joinRoom(codeRaw: string, displayName: string, avatar?: string, userId?: string): Promise<JoinRoomResult> {
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
    await this.sessions.save(playerToken, { roomId, playerId, userId });

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
        gameId: state.settings.gameId ?? "uno",
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
    gameId = "uno",
    userId?: string,
  ): Promise<(CreateRoomResult | JoinRoomResult) & { created: boolean }> {
    const open = (await this.listPublicRooms()).filter((room) => room.gameId === gameId);
    if (open.length > 0) {
      const joined = await this.joinRoom(open[0]!.code, displayName, avatar, userId);
      return { ...joined, created: false };
    }

    const created = await this.createRoom(displayName, avatar, {
      gameId,
      name: "بازی سریع",
      maxPlayers: 4,
      mode: "fast",
      isPrivate: false,
    }, userId);
    return { ...created, created: true };
  }

  async createBotMatch(displayName: string, totalPlayers: number, avatar?: string, gameId = "uno", userId?: string): Promise<BotMatchResult> {
    const game = this.gameDefinition(gameId);
    if (!game.chooseBotAction) throw new AppError("این بازی فعلا بات ندارد", "unsupported_bot", 400);
    if (totalPlayers < game.minPlayers || totalPlayers > Math.min(4, game.maxPlayers)) {
      throw new AppError(`تعداد بازیکن باید بین ${game.minPlayers} تا ${Math.min(4, game.maxPlayers)} باشد`, "bad_settings");
    }

    const created = await this.createRoom(displayName, avatar, {
      gameId,
      name: "بازی با بات",
      maxPlayers: totalPlayers,
      mode: "classic",
      isPrivate: true,
    }, userId);

    const state = await this.live.load(created.roomId);
    if (!state) throw new AppError("اتاق پیدا نشد", "not_found", 404);

    const existing = new Set(state.players.map((p) => p.displayName));
    const botsNeeded = totalPlayers - 1;
    const bots = this.botProfiles.pick(botsNeeded, existing);
    for (const bot of bots) {
      const botId = newPlayerId();
      let displayName = bot.displayName;
      while (existing.has(displayName)) {
        displayName = `${bot.displayName}${Math.floor(10 + Math.random() * 90)}`;
      }
      existing.add(displayName);
      const profile = this.botProfiles.toPlayerProfile(bot, displayName);
      state.players.push({
        id: botId,
        displayName,
        avatar: bot.avatar,
        profile,
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
      gameId: live.settings.gameId ?? "uno",
      name: live.settings.name,
      maxPlayers: live.settings.maxPlayers,
      currentPlayers: live.players.length,
      phase: live.phase,
      mode: live.settings.mode,
      isPrivate: live.settings.isPrivate,
    };
  }

  private handleGameEvents(state: LiveRoomState, events: CardGameEvent[] = []): void {
    for (const event of events) {
      this.events.onGameEvent?.(state.id, event);
      if (event.type !== "uno.declared") continue;
      const playerId = typeof event.payload?.playerId === "string" ? event.payload.playerId : "";
      if (!playerId) continue;
      const lobby = state.players.find((p) => p.id === playerId);
      this.events.onUnoDeclared?.(state.id, playerId, lobby?.displayName ?? "بازیکن");
    }
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

  async eliminateDisconnectedPlayer(roomId: string, playerId: string): Promise<void> {
    const state = await this.live.load(roomId);
    if (!state) return;

    const p = state.players.find((x) => x.id === playerId);
    if (!p || p.connected) return;
    if (state.phase === "playing" && state.game) {
      const game = this.gameForRoom(state);
      const result = game.removePlayer?.(state.game, playerId);
      if (result?.ok) {
        this.handleGameEvents(state, result.events);
        if (game.isFinished(state.game)) state.phase = "finished";
      }
    }
    this.bump(state);
    await this.persist(state, { resetTurnTimer: true });
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

    const game = this.gameForRoom(state);
    if (state.players.length < game.minPlayers) throw new AppError("حداقل دو بازیکن لازم است", "not_enough");
    if (state.players.length > game.maxPlayers) throw new AppError("تعداد بازیکن‌ها برای این بازی زیاد است", "bad_settings");

    const roster = state.players.map((p) => ({ id: p.id, displayName: p.displayName, avatar: p.avatar }));
    state.game = game.createInitialState(roster);
    state.phase = "playing";
    this.bump(state);
    await this.persist(state, { resetTurnTimer: true });
  }

  async playCard(
    token: string,
    cardId: string,
    opts?: { chosenColor?: "red" | "yellow" | "green" | "blue"; declareUno?: boolean },
  ): Promise<void> {
    await this.applyGameAction(token, {
      type: "playCard",
      cardId,
      chosenColor: opts?.chosenColor,
      declareUno: opts?.declareUno,
    });
  }

  async draw(token: string): Promise<void> {
    await this.applyGameAction(token, { type: "draw" });
  }

  async pass(token: string): Promise<void> {
    await this.applyGameAction(token, { type: "pass" });
  }

  async uno(token: string): Promise<void> {
    await this.applyGameAction(token, { type: "uno" });
  }

  async applyGameAction(token: string, action: CardGameAction): Promise<void> {
    const sess = await this.requirePlayingSession(token);
    const state = sess.state;
    if (!state.game) throw new AppError("بازی فعال نیست", "bad_phase");

    const game = this.gameForRoom(state);
    const res = game.applyAction(state.game, sess.playerId, action);
    if (!res.ok) throw new AppError(res.message, res.code);

    this.handleGameEvents(state, res.events);
    if (game.isFinished(state.game)) state.phase = "finished";
    this.bump(state);
    await this.persist(state, { resetTurnTimer: true });
  }

  async claimMatchResult(token: string, userId: string): Promise<ClaimedMatchResult> {
    const sess = await this.sessions.get(token);
    if (!sess) throw new AppError("نشست نامعتبر است", "unauthorized", 401);
    if (!sess.userId || sess.userId !== userId) {
      throw new AppError("این بازی به حساب شما وصل نیست", "forbidden", 403);
    }

    const state = await this.live.load(sess.roomId);
    if (!state || !state.game) throw new AppError("بازی پیدا نشد", "not_found", 404);
    if (state.phase !== "finished") throw new AppError("بازی هنوز تمام نشده است", "bad_phase", 409);

    const gameId = state.settings.gameId ?? "uno";
    const game = this.gameForRoom(state);
    if (!game.getPlayerResult) throw new AppError("ثبت نتیجه برای این بازی پشتیبانی نمی‌شود", "unsupported_game", 400);

    const result = game.getPlayerResult(state.game, sess.playerId);
    if (!result.eligible) {
      throw new AppError("بازیکن خارج‌شده امتیاز نمی‌گیرد", "not_eligible", 403);
    }

    state.matchRewardsClaimed ??= {};
    if (state.matchRewardsClaimed[sess.playerId]) {
      throw new AppError("امتیاز این بازی قبلاً ثبت شده است", "already_recorded", 409);
    }
    state.matchRewardsClaimed[sess.playerId] = true;
    this.bump(state);
    await this.persist(state);

    return { won: result.won, gameId };
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
  const game = getCardGame(state.settings.gameId ?? "uno");
  return {
    type: "room.state" as const,
    version: state.version,
    phase: state.phase,
    code: state.code,
    settings: state.settings,
    players: state.players,
    serverNow: Date.now(),
    turnDeadlineAt: state.turnDeadlineAt ?? null,
    game: state.game && game ? game.projectStateForPlayer(state.game, viewerId) : null,
  };
}
