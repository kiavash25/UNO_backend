import type { CardGameAction, CardGameDefinition, CardGameEvent } from "../domain/cardGame/cardGame.js";
import type { UnoGameState } from "../domain/uno/gameState.js";
import { getRankReward } from "../domain/cardGame/gameScoring.js";
import { getCardGame } from "../domain/cardGame/gameRegistry.js";
import { RoomRepository } from "../infrastructure/mongo/roomRepository.js";
import { UserRepository, type BotUser } from "../infrastructure/mongo/userRepository.js";
import { LiveRoomStore } from "../infrastructure/redis/liveRoomStore.js";
import { SessionStore } from "../infrastructure/redis/sessionStore.js";
import type { LiveRoomState } from "./liveRoomState.js";
import { generateRoomCode } from "./roomCode.js";
import type { LobbyPlayer, RoomSettings } from "./roomTypes.js";
import { AppError } from "./errors.js";
import { buildMatchRewardPatch } from "./matchRewardProgress.js";
import { newPlayerId, newPlayerToken, type SessionPayload } from "./session.js";
import type { MatchRewardContext } from "./userService.js";
import type { GameAnalyticsService } from "./gameAnalyticsService.js";

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
  rank: number;
  totalPlayers: number;
  isPrivate: boolean;
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

export type MatchRewardSummary = {
  playerId: string;
  rank: number;
  xp: number;
  coins: number;
};

export type RoomEvents = {
  onRoomChanged?: (roomId: string) => void;
  onUnoDeclared?: (roomId: string, playerId: string, displayName: string) => void;
  onGameEvent?: (roomId: string, event: CardGameEvent) => void;
  onRoomDestroyed?: (roomId: string) => void;
};

type RankableGameState = {
  winnerId?: string | null;
  players?: { id: string; displayName?: string; handCount?: number; eliminated?: boolean }[];
  eliminatedPlayerIds?: Record<string, boolean>;
};

function getRewardRanking(gameState: unknown): string[] {
  const state = gameState as RankableGameState;
  const players = Array.isArray(state.players) ? state.players : [];
  const eligiblePlayers = players.filter((player) => !player.eliminated && !state.eliminatedPlayerIds?.[player.id]);
  const winner = eligiblePlayers.find((player) => player.id === state.winnerId);
  const rest = eligiblePlayers
    .filter((player) => player.id !== state.winnerId)
    .sort((a, b) => {
      const handCountDelta = (a.handCount ?? 0) - (b.handCount ?? 0);
      if (handCountDelta !== 0) return handCountDelta;
      return (a.displayName ?? "").localeCompare(b.displayName ?? "", "fa");
    });

  return [...(winner ? [winner] : []), ...rest].map((player) => player.id);
}

function buildMatchRewards(state: LiveRoomState): MatchRewardSummary[] {
  if (!state.game) return [];
  const ranking = getRewardRanking(state.game);
  const totalPlayers = ranking.length || state.players.length || state.settings.maxPlayers;

  return ranking.map((playerId, index) => {
    const rank = index + 1;
    const reward = getRankReward(
      state.settings.gameId ?? "uno",
      rank,
      totalPlayers,
      state.settings.isPrivate,
    );

    return {
      playerId,
      rank,
      xp: reward.xp,
      coins: reward.coins,
    };
  });
}

function getTurnTimeoutMs(state: LiveRoomState, fallbackMs = 10_000): number {
  const timeoutSec = state.settings.turnTimeoutSec;
  return Number.isFinite(timeoutSec) && timeoutSec > 0 ? timeoutSec * 1000 : fallbackMs;
}

export class RoomService {
  private readonly botTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly defaultTurnTimeoutMs = 10_000;

  constructor(
    private readonly rooms: RoomRepository,
    private readonly users: UserRepository,
    private readonly live: LiveRoomStore,
    private readonly sessions: SessionStore,
    private readonly events: RoomEvents = {},
    private readonly analytics?: GameAnalyticsService,
  ) {}

  private trackAnalytics(task: Promise<void>): void {
    void task.catch((error) => {
      console.error("game analytics failed", error);
    });
  }

  private cloneGameState<T>(state: T): T {
    return JSON.parse(JSON.stringify(state)) as T;
  }

  private getTurnTimeoutMs(state: LiveRoomState): number {
    return getTurnTimeoutMs(state, this.defaultTurnTimeoutMs);
  }

  private currentTurnStartedAt(state: LiveRoomState): number {
    return state.turnDeadlineAt ? state.turnDeadlineAt - this.getTurnTimeoutMs(state) : Date.now();
  }

  private trackUnoActionAndFinish(params: {
    state: LiveRoomState;
    playerId: string;
    action: CardGameAction;
    beforeGame: unknown;
    endedAtMs: number;
    startedAtMs: number;
    events?: CardGameEvent[];
    penaltyCards?: number;
  }): void {
    if ((params.state.settings.gameId ?? "uno") !== "uno" || !params.state.game) return;
    this.trackAnalytics((async () => {
      await this.analytics?.unoAction({
        roomId: params.state.id,
        playerId: params.playerId,
        action: params.action,
        before: params.beforeGame as UnoGameState,
        after: this.cloneGameState(params.state.game) as UnoGameState,
        startedAtMs: params.startedAtMs,
        endedAtMs: params.endedAtMs,
        events: params.events,
        penaltyCards: params.penaltyCards,
      });
      if (params.state.phase === "finished") {
        await this.analytics?.finishGame(params.state, buildMatchRewards(params.state));
      }
    })());
  }

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
    state.turnDeadlineAt = state.phase === "playing" && activePlayerId ? Date.now() + this.getTurnTimeoutMs(state) : null;
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

    const beforeGame = this.cloneGameState(state.game);
    const startedAtMs = expectedDeadline - this.getTurnTimeoutMs(state);
    const result = game.handleTurnTimeout(state.game, playerId);
    if (!result.ok) return;
    const endedAtMs = Date.now();

    const eliminated = result.events?.some((event) => event.type === "uno.playerEliminated") ?? false;
    this.handleGameEvents(state, [
      ...(result.events ?? []),
      ...(eliminated
        ? []
        : [{ type: "game.turnTimedOut", payload: { playerId, penaltyCards: result.penaltyCards ?? 1 } }]),
    ]);
    if (game.isFinished(state.game)) state.phase = "finished";
    this.bump(state);
    await this.persist(state, { resetTurnTimer: true });
    await this.applyBotRewardsIfFinished(state);
    this.trackUnoActionAndFinish({
      state,
      playerId,
      action: { type: "timeout" },
      beforeGame,
      startedAtMs,
      endedAtMs,
      events: result.events,
      penaltyCards: result.penaltyCards,
    });
    if (eliminated) {
      this.trackAnalytics(this.analytics?.playerEliminated(state, playerId, "timeout") ?? Promise.resolve());
    }
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

      const base = state.settings.mode === "fast" ? 400 : 900;
      const extra = state.settings.mode === "fast" ? 1000 : 1800;
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

    const beforeGame = this.cloneGameState(state.game);
    const startedAtMs = this.currentTurnStartedAt(state);
    const result = game.applyAction(state.game, botId, action);
    if (!result.ok) return;
    const endedAtMs = Date.now();

    this.handleGameEvents(state, result.events);
    if (game.isFinished(state.game)) state.phase = "finished";
    this.bump(state);
    await this.persist(state, { resetTurnTimer: true });
    await this.applyBotRewardsIfFinished(state);
    this.trackUnoActionAndFinish({
      state,
      playerId: botId,
      action,
      beforeGame,
      startedAtMs,
      endedAtMs,
      events: result.events,
      penaltyCards: result.penaltyCards,
    });
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
      turnTimeoutSec: this.defaultTurnTimeoutMs,
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
    this.trackAnalytics(this.analytics?.roomCreated(state, playerToken, userId) ?? Promise.resolve());

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
    this.trackAnalytics(this.analytics?.playerJoined(state, playerId, playerToken, userId) ?? Promise.resolve());

    return { roomId, code: state.code, playerToken, playerId };
  }

  recordPlayerDevice(roomId: string, playerId: string, userAgent?: string): void {
    this.trackAnalytics((async () => {
      const state = await this.live.load(roomId);
      if (!state) return;
      await this.analytics?.playerDevice(state, playerId, userAgent);
    })());
  }

  async recordChat(roomId: string, playerId: string, text?: string, emoji?: string): Promise<void> {
    const state = await this.live.load(roomId);
    if (!state) return;
    this.trackAnalytics(this.analytics?.chat(state, playerId, text, emoji) ?? Promise.resolve());
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
    const availableBots = (await this.users.listBots(200))
      .filter((bot) => !existing.has(bot.displayName))
      .sort(() => Math.random() - 0.5);
    if (availableBots.length < botsNeeded) {
      throw new AppError("تعداد کاربرفعال در دسترس کافی نیست", "insufficient_bots", 409);
    }

    for (const bot of availableBots.slice(0, botsNeeded)) {
      const botId = newPlayerId();
      let botDisplayName = bot.displayName;
      while (existing.has(botDisplayName)) {
        botDisplayName = `${bot.displayName}${Math.floor(10 + Math.random() * 90)}`;
      }
      existing.add(botDisplayName);
      const profile = this.toBotPlayerProfile(bot, botDisplayName);
      state.players.push({
        id: botId,
        displayName: botDisplayName,
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

  private toBotPlayerProfile(bot: BotUser, displayName: string): LobbyPlayer["profile"] {
    return {
      id: `bot:${String(bot._id)}`,
      username: bot.username?.trim() || `bot_${String(bot._id).slice(-6)}`,
      displayName,
      avatar: bot.avatar,
      xp: bot.xp,
      level: bot.level,
      coins: bot.coins,
      wins: bot.wins,
      gamesPlayed: bot.gamesPlayed,
      winStreak: bot.winStreak,
      bestWinStreak: bot.bestWinStreak,
      accuracyPct: bot.accuracyPct,
      isBot: true,
    };
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
        this.trackAnalytics(this.analytics?.playerEliminated(state, playerId, "disconnect") ?? Promise.resolve());
      }
    }
    this.bump(state);
    await this.persist(state, { resetTurnTimer: true });
    await this.applyBotRewardsIfFinished(state);
    if (state.phase === "finished") {
      this.trackAnalytics(this.analytics?.finishGame(state, buildMatchRewards(state)) ?? Promise.resolve());
    }
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
    this.trackAnalytics(this.analytics?.gameStarted(state) ?? Promise.resolve());
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
    const beforeGame = this.cloneGameState(state.game);
    const startedAtMs = this.currentTurnStartedAt(state);
    const res = game.applyAction(state.game, sess.playerId, action);
    if (!res.ok) throw new AppError(res.message, res.code);
    const endedAtMs = Date.now();

    this.handleGameEvents(state, res.events);
    if (game.isFinished(state.game)) state.phase = "finished";
    this.bump(state);
    await this.persist(state, { resetTurnTimer: true });
    await this.applyBotRewardsIfFinished(state);
    this.trackUnoActionAndFinish({
      state,
      playerId: sess.playerId,
      action,
      beforeGame,
      startedAtMs,
      endedAtMs,
      events: res.events,
      penaltyCards: res.penaltyCards,
    });
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

    const matchRewards = buildMatchRewards(state);
    const playerReward = matchRewards.find((reward) => reward.playerId === sess.playerId);
    const rank = playerReward?.rank ?? (result.won ? 1 : Math.max(2, matchRewards.length));
    const totalPlayers = matchRewards.length || state.players.length || state.settings.maxPlayers;

    return { won: result.won, gameId, rank, totalPlayers, isPrivate: state.settings.isPrivate };
  }

  private async applyBotRewardsIfFinished(state: LiveRoomState): Promise<void> {
    if (state.phase !== "finished" || !state.game) return;
    const game = this.gameForRoom(state);
    if (!game.getPlayerResult) return;

    state.matchRewardsClaimed ??= {};
    const rewards = buildMatchRewards(state);
    const totalPlayers = rewards.length || state.players.length || state.settings.maxPlayers;
    let changed = false;

    for (const reward of rewards) {
      const player = state.players.find((p) => p.id === reward.playerId);
      if (!player?.isBot) continue;
      if (state.matchRewardsClaimed[player.id]) continue;

      const botProfileId = player.profile?.id;
      if (!botProfileId?.startsWith("bot:")) continue;
      const userId = botProfileId.slice(4);
      if (!userId) continue;

      const user = await this.users.findById(userId);
      if (!user) continue;

      const playerResult = game.getPlayerResult(state.game, player.id);
      if (!playerResult.eligible) continue;

      const patch = buildMatchRewardPatch(user, {
        won: playerResult.won,
        gameId: state.settings.gameId ?? "uno",
        rank: reward.rank,
        totalPlayers,
        isPrivate: state.settings.isPrivate,
      } satisfies MatchRewardContext);
      const updated = await this.users.updateById(userId, patch);
      if (!updated) continue;

      state.matchRewardsClaimed[player.id] = true;
      changed = true;
    }

    if (changed) {
      this.bump(state);
      await this.persist(state);
    }
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
    turnTimeoutMs: getTurnTimeoutMs(state),
    turnDeadlineAt: state.turnDeadlineAt ?? null,
    game: state.game && game ? game.projectStateForPlayer(state.game, viewerId) : null,
    matchRewards: state.phase === "finished" ? buildMatchRewards(state) : [],
  };
}
