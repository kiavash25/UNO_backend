import type { CardGameActionResult, GameRosterPlayer } from "../cardGame/cardGame.js";
import { getExplodingKittensCardDefinition } from "./cards/index.js";
import { buildExplodingKittensSetup } from "./deck.js";
import {
  advanceTurn,
  clearPeekState,
  consumeCurrentTurn,
  currentPlayerId,
  discardCards,
  drawTopCard,
  eliminatePlayer,
  giveCardToPlayer,
  insertCardIntoDrawPile,
  makeEvent,
  markWinnerIfNeeded,
  pickTimedWinner,
  removeCardFromHand,
  removeCardsFromHand,
  stealNamedCard,
  stealRandomCard,
  syncPlayers,
  takeDiscardCard,
} from "./engineHelpers.js";
import type { ExplodingKittensCard } from "./card.js";
import type { ExplodingKittensGameState } from "./gameState.js";
import type {
  ComboEffect,
  ExplodingKittensAction,
  ExplodingKittensPendingAction,
  ExplodingKittensPendingEffect,
} from "./types.js";

function asPlayAction(action: ExplodingKittensAction) {
  if (action.type !== "play" && action.type !== "playCard") return null;
  return action;
}

function isAliveParticipant(state: ExplodingKittensGameState, playerId: string): boolean {
  return state.players.some((player) => player.id === playerId && !state.eliminatedPlayerIds[playerId]);
}

function requireCurrentTurn(state: ExplodingKittensGameState, playerId: string): CardGameActionResult | null {
  if (currentPlayerId(state) !== playerId) {
    return { ok: false, code: "turn", message: "الان نوبت این بازیکن نیست" };
  }
  return null;
}

function finalizeEffectResolution(
  state: ExplodingKittensGameState,
  effect: ExplodingKittensPendingEffect,
): CardGameActionResult {
  if (effect.type === "combo_steal") {
    const stolen = stealRandomCard(state, effect.targetPlayerId, effect.actorId);
    return {
      ok: true,
      events: [
        makeEvent("exploding_kittens.comboStealResolved", {
          actorId: effect.actorId,
          targetPlayerId: effect.targetPlayerId,
          stolenCardType: stolen?.type ?? null,
        }),
      ],
    };
  }

  if (effect.type === "combo_request") {
    const stolen = stealNamedCard(state, effect.targetPlayerId, effect.actorId, effect.requestedCardType);
    return {
      ok: true,
      events: [
        makeEvent("exploding_kittens.comboRequestResolved", {
          actorId: effect.actorId,
          targetPlayerId: effect.targetPlayerId,
          requestedCardType: effect.requestedCardType,
          success: Boolean(stolen),
        }),
      ],
    };
  }

  if (effect.type === "combo_retrieve") {
    const card = takeDiscardCard(state, effect.discardCardId);
    if (!card) {
      return { ok: false, code: "discard", message: "کارت انتخاب‌شده در discard pile پیدا نشد" };
    }
    giveCardToPlayer(state, effect.actorId, card);
    return {
      ok: true,
      events: [
        makeEvent("exploding_kittens.comboRetrieveResolved", {
          actorId: effect.actorId,
          cardType: card.type,
        }),
      ],
    };
  }

  const definition = getExplodingKittensCardDefinition(effect.sourceCardType);
  if (!definition?.resolveEffect) {
    return { ok: false, code: "effect", message: "منطق اثر کارت پیدا نشد" };
  }

  return definition.resolveEffect({ state, effect });
}

function resolvePendingNopeWindow(
  state: ExplodingKittensGameState,
  pending: Extract<ExplodingKittensPendingAction, { type: "nope_window" }>,
): CardGameActionResult {
  state.pendingAction = null;

  if (pending.nopeCount % 2 === 1) {
    return {
      ok: true,
      events: [
        makeEvent("exploding_kittens.cardNoped", {
          actorId: pending.effect.actorId,
          sourceCardType: pending.effect.sourceCardType,
          nopeCount: pending.nopeCount,
        }),
      ],
    };
  }

  return finalizeEffectResolution(state, pending.effect);
}

function findDefuseCard(state: ExplodingKittensGameState, playerId: string): ExplodingKittensCard | null {
  return state.hands[playerId]?.find((card) => card.type === "defuse") ?? null;
}

function handleDrawAction(state: ExplodingKittensGameState, playerId: string): CardGameActionResult {
  const badTurn = requireCurrentTurn(state, playerId);
  if (badTurn) return badTurn;

  if (!state.drawPile.length) {
    return { ok: false, code: "deck", message: "draw pile خالی است" };
  }

  clearPeekState(state);
  const card = drawTopCard(state);

  if (card.type === "exploding_kitten") {
    const defuseCard = findDefuseCard(state, playerId);
    if (defuseCard) {
      const consumedDefuse = removeCardFromHand(state, playerId, defuseCard.id);
      if (consumedDefuse) {
        discardCards(state, [consumedDefuse]);
      }

      const remainingTurnsAfterDefuse = Math.max(0, state.remainingTurns - 1);
      state.pendingAction = {
        type: "defuse",
        playerId,
        resolverPlayerId: playerId,
        explodingKittenCard: card,
        remainingTurnsAfterDefuse,
      };
      syncPlayers(state);
      return {
        ok: true,
        events: [
          makeEvent("exploding_kittens.defuseRequired", {
            playerId,
            remainingTurnsAfterDefuse,
          }),
        ],
      };
    }

    discardCards(state, [card]);
    eliminatePlayer(state, playerId);
    if (state.status !== "finished") {
      state.remainingTurns = 1;
      state.pendingAttackStacks = 0;
    }
    syncPlayers(state);
    return {
      ok: true,
      events: [
        makeEvent("exploding_kittens.playerExploded", {
          playerId,
          winnerId: state.winnerId,
        }),
      ],
    };
  }

  giveCardToPlayer(state, playerId, card);
  const nextPlayerId = consumeCurrentTurn(state);
  syncPlayers(state);
  return {
    ok: true,
    events: [
      makeEvent("exploding_kittens.cardDrawn", {
        playerId,
        cardType: card.type,
        nextPlayerId,
        remainingTurns: state.remainingTurns,
      }),
    ],
  };
}

function playNopeCard(
  state: ExplodingKittensGameState,
  playerId: string,
  action: ReturnType<typeof asPlayAction>,
): CardGameActionResult {
  const card = removeCardFromHand(state, playerId, action!.cardId);
  if (!card || card.type !== "nope") {
    return { ok: false, code: "card", message: "کارت Nope در دست بازیکن نیست" };
  }

  discardCards(state, [card]);
  const pending = state.pendingAction;
  if (!pending || pending.type !== "nope_window") {
    return { ok: false, code: "no_pending", message: "فعلاً چیزی برای Nope کردن وجود ندارد" };
  }

  pending.nopeCount += 1;
  pending.respondedPlayerIds = [...new Set([...pending.respondedPlayerIds, playerId])];
  syncPlayers(state);
  return {
    ok: true,
    events: [
      makeEvent("exploding_kittens.nopePlayed", {
        playerId,
        sourceCardType: pending.effect.sourceCardType,
        nopeCount: pending.nopeCount,
      }),
    ],
  };
}

function handlePlayAction(
  state: ExplodingKittensGameState,
  playerId: string,
  action: ReturnType<typeof asPlayAction>,
): CardGameActionResult {
  const badTurn = requireCurrentTurn(state, playerId);
  if (badTurn) return badTurn;

  const handCard = state.hands[playerId]?.find((card) => card.id === action!.cardId) ?? null;
  if (!handCard) {
    return { ok: false, code: "card", message: "کارت انتخاب‌شده در دست بازیکن نیست" };
  }

  const definition = getExplodingKittensCardDefinition(handCard.type);
  if (!definition) {
    return { ok: false, code: "card", message: "تعریف این کارت پیدا نشد" };
  }
  if (definition.playMode === "never") {
    return { ok: false, code: "card", message: "این کارت به‌صورت مستقیم قابل بازی نیست" };
  }
  if (definition.playMode === "response_only") {
    return { ok: false, code: "card", message: "این کارت فقط در پاسخ به یک اثر قابل بازی است" };
  }

  const result = definition.onPlay?.({
    state,
    actorId: playerId,
    card: handCard,
    action: action!,
  });

  if (!result) {
    return { ok: false, code: "card", message: "منطق این کارت پیاده‌سازی نشده است" };
  }
  if (!result.ok) return result;

  const removedCard = removeCardFromHand(state, playerId, handCard.id);
  if (!removedCard) {
    return { ok: false, code: "card", message: "امکان حذف کارت از دست بازیکن نبود" };
  }
  discardCards(state, [removedCard]);

  if (result.pendingEffect) {
    if (definition.canBeNoped) {
      state.pendingAction = {
        type: "nope_window",
        effect: result.pendingEffect,
        nopeCount: 0,
        resolverPlayerId: playerId,
        respondedPlayerIds: [],
      };
      syncPlayers(state);
      return {
        ok: true,
        events: [
          makeEvent("exploding_kittens.effectPending", {
            actorId: playerId,
            sourceCardType: result.pendingEffect.sourceCardType,
          }),
          ...(result.events ?? []),
        ],
      };
    }

    const resolved = finalizeEffectResolution(state, result.pendingEffect);
    if (!resolved.ok) return resolved;
    syncPlayers(state);
    return {
      ok: true,
      events: [...(result.events ?? []), ...(resolved.events ?? [])],
    };
  }

  syncPlayers(state);
  return { ok: true, events: result.events };
}

function buildComboEffect(
  state: ExplodingKittensGameState,
  playerId: string,
  action: Extract<ExplodingKittensAction, { type: "combo" }>,
): CardGameActionResult | ComboEffect {
  const uniqueIds = [...new Set(action.cardIds)];
  if (uniqueIds.length !== action.cardIds.length) {
    return { ok: false, code: "combo", message: "کارت‌های combo نباید تکراری باشند" };
  }
  if (![2, 3, 5].includes(uniqueIds.length)) {
    return { ok: false, code: "combo", message: "combo فقط با ۲، ۳ یا ۵ کارت مجاز است" };
  }

  const hand = state.hands[playerId] ?? [];
  const cards = uniqueIds.map((cardId) => hand.find((card) => card.id === cardId) ?? null);
  if (cards.some((card) => !card)) {
    return { ok: false, code: "combo", message: "همه کارت‌های combo باید در دست بازیکن باشند" };
  }

  const definitions = cards.map((card) => getExplodingKittensCardDefinition(card!.type));
  if (definitions.some((definition) => !definition || definition.category !== "cat" || !definition.comboFamily)) {
    return { ok: false, code: "combo", message: "combo فقط با کارت‌های cat مجاز است" };
  }

  const families = definitions.map((definition) => definition!.comboFamily!);
  const familySet = new Set(families);

  if (uniqueIds.length === 2) {
    if (familySet.size !== 1) {
      return { ok: false, code: "combo", message: "combo دوتایی باید از دو کارت cat یکسان باشد" };
    }
    if (!action.targetPlayerId) {
      return { ok: false, code: "target", message: "برای combo دوتایی باید بازیکن هدف انتخاب شود" };
    }
    return {
      type: "combo_steal",
      actorId: playerId,
      sourceCardType: "combo_pair",
      cardIds: uniqueIds,
      targetPlayerId: action.targetPlayerId,
    };
  }

  if (uniqueIds.length === 3) {
    if (familySet.size !== 1) {
      return { ok: false, code: "combo", message: "combo سه‌تایی باید از سه کارت cat یکسان باشد" };
    }
    if (!action.targetPlayerId || !action.requestedCardType) {
      return {
        ok: false,
        code: "combo",
        message: "برای combo سه‌تایی باید هم بازیکن هدف و هم نوع کارت درخواست‌شده مشخص شود",
      };
    }
    return {
      type: "combo_request",
      actorId: playerId,
      sourceCardType: "combo_triple",
      cardIds: uniqueIds,
      targetPlayerId: action.targetPlayerId,
      requestedCardType: action.requestedCardType,
    };
  }

  if (familySet.size !== 5) {
    return { ok: false, code: "combo", message: "combo پنج‌تایی باید از پنج cat متفاوت باشد" };
  }
  if (!action.discardCardId) {
    return { ok: false, code: "combo", message: "برای combo پنج‌تایی باید کارت discard انتخاب شود" };
  }
  return {
    type: "combo_retrieve",
    actorId: playerId,
    sourceCardType: "combo_five",
    cardIds: uniqueIds,
    discardCardId: action.discardCardId,
  };
}

function handleComboAction(
  state: ExplodingKittensGameState,
  playerId: string,
  action: Extract<ExplodingKittensAction, { type: "combo" }>,
): CardGameActionResult {
  const badTurn = requireCurrentTurn(state, playerId);
  if (badTurn) return badTurn;

  const comboEffect = buildComboEffect(state, playerId, action);
  if ("ok" in comboEffect) return comboEffect;

  const removedCards = removeCardsFromHand(state, playerId, comboEffect.cardIds);
  if (!removedCards) {
    return { ok: false, code: "combo", message: "امکان حذف کارت‌های combo از دست بازیکن نبود" };
  }
  discardCards(state, removedCards);

  state.pendingAction = {
    type: "nope_window",
    effect: comboEffect,
    nopeCount: 0,
    resolverPlayerId: playerId,
    respondedPlayerIds: [],
  };
  syncPlayers(state);
  return {
    ok: true,
    events: [
      makeEvent("exploding_kittens.comboPending", {
        actorId: playerId,
        comboType: comboEffect.type,
      }),
    ],
  };
}

function handleFavorResponse(
  state: ExplodingKittensGameState,
  playerId: string,
  action: ExplodingKittensAction,
): CardGameActionResult {
  const pending = state.pendingAction;
  if (!pending || pending.type !== "favor_response") {
    return { ok: false, code: "pending", message: "هیچ Favor فعالی برای پاسخ وجود ندارد" };
  }
  if (playerId !== pending.targetPlayerId) {
    return { ok: false, code: "turn", message: "فقط بازیکن هدف باید کارت Favor را بدهد" };
  }
  if (action.type !== "giveFavorCard") {
    return { ok: false, code: "action", message: "برای Favor باید یک کارت برای دادن انتخاب شود" };
  }

  const card = removeCardFromHand(state, playerId, action.cardId);
  if (!card) {
    return { ok: false, code: "card", message: "کارت انتخاب‌شده برای Favor در دست بازیکن نیست" };
  }

  state.pendingAction = null;
  giveCardToPlayer(state, pending.actorId, card);
  syncPlayers(state);
  return {
    ok: true,
    events: [
      makeEvent("exploding_kittens.favorResolved", {
        actorId: pending.actorId,
        targetPlayerId: pending.targetPlayerId,
        cardType: card.type,
      }),
    ],
  };
}

function handleDefuseAction(
  state: ExplodingKittensGameState,
  playerId: string,
  action: ExplodingKittensAction,
): CardGameActionResult {
  const pending = state.pendingAction;
  if (!pending || pending.type !== "defuse") {
    return { ok: false, code: "pending", message: "هیچ Defuse فعالی وجود ندارد" };
  }
  if (playerId !== pending.playerId) {
    return { ok: false, code: "turn", message: "فقط بازیکنی که منفجر شده باید Defuse را انجام دهد" };
  }
  if (action.type !== "defuse") {
    return { ok: false, code: "action", message: "برای ادامه باید جای قرار گرفتن Exploding Kitten مشخص شود" };
  }

  insertCardIntoDrawPile(state, pending.explodingKittenCard, action.insertIndex);
  state.pendingAction = null;

  if (pending.remainingTurnsAfterDefuse > 0) {
    state.remainingTurns = pending.remainingTurnsAfterDefuse;
    state.pendingAttackStacks = Math.max(0, state.remainingTurns - 1);
  } else {
    advanceTurn(state, 1);
  }

  syncPlayers(state);
  return {
    ok: true,
    events: [
      makeEvent("exploding_kittens.defuseResolved", {
        playerId,
        remainingTurns: state.remainingTurns,
      }),
    ],
  };
}

export function createExplodingKittensInitialState(roster: GameRosterPlayer[]): ExplodingKittensGameState {
  if (roster.length < 2 || roster.length > 5) {
    throw new Error("Exploding Kittens player count must be 2..5");
  }

  const setup = buildExplodingKittensSetup(roster.map((player) => player.id));
  const players = roster.map((player) => ({
    id: player.id,
    displayName: player.displayName,
    avatar: player.avatar,
    handCount: setup.hands[player.id]?.length ?? 0,
    alive: true,
  }));
  const turnIndex = Math.floor(Math.random() * players.length);

  return {
    status: "playing",
    players,
    turnIndex,
    remainingTurns: 1,
    drawPileCount: setup.drawPile.length,
    drawPile: setup.drawPile,
    discardPile: [],
    hands: setup.hands,
    winnerId: null,
    eliminatedPlayerIds: {},
    pendingAttackStacks: 0,
    pendingAction: null,
    peekByPlayerId: {},
    enabledCardTypes: setup.enabledCardTypes,
  };
}

export function applyExplodingKittensAction(
  state: ExplodingKittensGameState,
  playerId: string,
  action: ExplodingKittensAction,
): CardGameActionResult {
  if (state.status !== "playing") {
    return { ok: false, code: "finished", message: "بازی تمام شده است" };
  }
  if (!isAliveParticipant(state, playerId)) {
    return { ok: false, code: "player", message: "این بازیکن دیگر در بازی فعال نیست" };
  }

  const playAction = asPlayAction(action);

  if (state.pendingAction?.type === "nope_window") {
    if (action.type === "resolveNope") {
      const resolved = resolvePendingNopeWindow(state, state.pendingAction);
      syncPlayers(state);
      return resolved;
    }

    if (playAction) {
      const card = state.hands[playerId]?.find((entry) => entry.id === playAction.cardId);
      if (card?.type === "nope") {
        return playNopeCard(state, playerId, playAction);
      }
    }

    return { ok: false, code: "pending", message: "اول باید پنجره Nope تعیین تکلیف شود" };
  }

  if (state.pendingAction?.type === "favor_response") {
    return handleFavorResponse(state, playerId, action);
  }

  if (state.pendingAction?.type === "defuse") {
    return handleDefuseAction(state, playerId, action);
  }

  if (action.type === "draw") {
    return handleDrawAction(state, playerId);
  }

  if (playAction) {
    return handlePlayAction(state, playerId, playAction);
  }

  if (action.type === "combo") {
    return handleComboAction(state, playerId, action);
  }

  return { ok: false, code: "action", message: "حرکت ارسالی برای Exploding Kittens پشتیبانی نمی‌شود" };
}

export function handleExplodingKittensTurnTimeout(
  state: ExplodingKittensGameState,
  playerId: string,
): CardGameActionResult {
  if (state.pendingAction?.type === "nope_window") {
    return resolvePendingNopeWindow(state, state.pendingAction);
  }

  if (state.pendingAction?.type === "favor_response") {
    const pending = state.pendingAction;
    const hand = state.hands[pending.targetPlayerId] ?? [];
    const card = hand[0];
    if (!card) {
      state.pendingAction = null;
      return {
        ok: true,
        events: [
          makeEvent("exploding_kittens.favorSkipped", {
            actorId: pending.actorId,
            targetPlayerId: pending.targetPlayerId,
          }),
        ],
      };
    }
    return handleFavorResponse(state, playerId, { type: "giveFavorCard", cardId: card.id });
  }

  if (state.pendingAction?.type === "defuse") {
    return handleDefuseAction(state, playerId, {
      type: "defuse",
      insertIndex: Math.floor(Math.random() * (state.drawPile.length + 1)),
    });
  }

  return handleDrawAction(state, playerId);
}

export function finishExplodingKittensTimedMatch(state: ExplodingKittensGameState): CardGameActionResult {
  state.status = "finished";
  state.pendingAction = null;
  state.winnerId = pickTimedWinner(state);
  markWinnerIfNeeded(state);
  syncPlayers(state);
  return {
    ok: true,
    events: [
      makeEvent("exploding_kittens.matchFinished", {
        reason: "timer",
        winnerId: state.winnerId,
      }),
    ],
  };
}

export function removePlayerFromExplodingKittens(
  state: ExplodingKittensGameState,
  playerId: string,
): CardGameActionResult {
  if (!state.players.some((entry) => entry.id === playerId)) {
    return {
      ok: false,
      code: "player_not_found",
      message: "بازیکن در بازی Exploding Kittens پیدا نشد",
    };
  }

  eliminatePlayer(state, playerId);
  syncPlayers(state);
  return {
    ok: true,
    events: [
      makeEvent("exploding_kittens.playerRemoved", {
        playerId,
        winnerId: state.winnerId,
      }),
    ],
  };
}
