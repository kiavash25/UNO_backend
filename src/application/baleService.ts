import axios from "axios";
import type { BaleLogCreateInput, BaleLogRepository } from "../infrastructure/mongo/baleLogRepository.js";
import type { UserRepository } from "../infrastructure/mongo/userRepository.js";

const BALE_BOT_TOKEN = process.env.BALE_BOT_TOKEN!;
const BALE_API_URL = `https://tapi.bale.ai/bot${BALE_BOT_TOKEN}`;

const START_TEXT = `سلام 👋

به Cardix خوش اومدی 🎮

اینجا می‌تونی بازی‌های کارتی و دورهمی رو آنلاین بازی کنی.
فعلاً با UNO شروع کردیم.

👇 از دکمه‌های زیر شروع کن:`;

const GUIDE_TEXT = `📘 راهنمای سریع UNO

کارت هم‌رنگ یا هم‌عدد بنداز.
اگه کارت مناسب نداری، کارت بکش.
اولین کسی که کارت‌هاش تموم بشه برنده‌ست 🏆`;

type BaleUser = {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type BaleChat = {
  id: number | string;
};

export type BaleMessage = {
  message_id?: number;
  text?: string;
  from?: BaleUser;
  chat: BaleChat;
};

export type BaleCallbackQuery = {
  data?: string;
  from?: BaleUser;
  message?: BaleMessage;
};

type BaleActorContext = {
  chatId?: string;
  baleUserId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  text?: string;
  callbackData?: string;
  messageId?: number;
};

export class BaleService {
  constructor(
    private readonly baleLogs: BaleLogRepository,
    private readonly users: UserRepository,
  ) {}

  startInlineKeyboard = {
    inline_keyboard: [
      [{ text: "🎮 شروع بازی", url: "https://cardix.ir" }],
      [{ text: "👥 بازی با دوستام", url: "https://cardix.ir/room" }],
      [{ text: "📢 کانال کاردیکس", url: "https://ble.ir/cardix" }],
      [{ text: "📘 راهنمای سریع", callback_data: "guide" }],
    ],
  };

  private clean(value?: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  private fromMessage(message?: BaleMessage): BaleActorContext {
    return {
      chatId: message ? String(message.chat.id) : undefined,
      baleUserId: message?.from?.id !== undefined ? String(message.from.id) : undefined,
      username: message?.from?.username,
      firstName: message?.from?.first_name,
      lastName: message?.from?.last_name,
      text: message?.text,
      messageId: message?.message_id,
    };
  }

  private fromCallback(callbackQuery?: BaleCallbackQuery): BaleActorContext {
    return {
      chatId:
        callbackQuery?.message?.chat.id !== undefined
          ? String(callbackQuery.message.chat.id)
          : undefined,
      baleUserId:
        callbackQuery?.from?.id !== undefined ? String(callbackQuery.from.id) : undefined,
      username: callbackQuery?.from?.username,
      firstName: callbackQuery?.from?.first_name,
      lastName: callbackQuery?.from?.last_name,
      text: callbackQuery?.message?.text,
      callbackData: callbackQuery?.data,
      messageId: callbackQuery?.message?.message_id,
    };
  }

  private async persistLog(input: BaleLogCreateInput) {
    const baleUserId = this.clean(input.baleUserId);
    const linkedUser = baleUserId ? await this.users.findByBaleUserId(baleUserId) : null;

    return this.baleLogs.create({
      ...input,
      chatId: this.clean(input.chatId),
      baleUserId,
      username: this.clean(input.username),
      firstName: this.clean(input.firstName),
      lastName: this.clean(input.lastName),
      platformUserId: linkedUser ? String(linkedUser._id) : undefined,
      platformDisplayName: this.clean(linkedUser?.displayName),
      text: this.clean(input.text),
      callbackData: this.clean(input.callbackData),
      errorMessage: this.clean(input.errorMessage),
    });
  }

  private async logEvent(
    event: BaleLogCreateInput["event"],
    context: BaleActorContext,
    extra: Omit<
      BaleLogCreateInput,
      | "event"
      | "chatId"
      | "baleUserId"
      | "username"
      | "firstName"
      | "lastName"
      | "text"
      | "callbackData"
      | "messageId"
    > = {},
  ) {
    await this.persistLog({
      event,
      chatId: context.chatId,
      baleUserId: context.baleUserId,
      username: context.username,
      firstName: context.firstName,
      lastName: context.lastName,
      text: context.text,
      callbackData: context.callbackData,
      messageId: context.messageId,
      ...extra,
    });
  }

  private async sendMessage(
    chatId: number | string,
    text: string,
    replyMarkup?: unknown,
  ) {
    return axios.post(`${BALE_API_URL}/sendMessage`, {
      chat_id: chatId,
      text,
      reply_markup: replyMarkup,
    });
  }

  async logWebhookError(input: Omit<BaleLogCreateInput, "event">) {
    await this.persistLog({
      event: "webhook_error",
      ...input,
    });
  }

  async handleBaleMessageText(
    message?: BaleMessage,
    updateId?: number
  ) {
    const text = message?.text;
    const chatId = message?.chat.id ?? 0;

    await this.logEvent("incoming_message", this.fromMessage(message), {
      updateId,
      status: "success",
      raw: message,
    });


    if (text !== "/start") return;

    await this.sendMessage(chatId, START_TEXT, this.startInlineKeyboard);
    await this.logEvent(
      "outgoing_message",
      { ...this.fromMessage(message), chatId: String(chatId), text: START_TEXT },
      {
        status: "success",
        raw: { trigger: text, replyType: "start" },
      },
    );
  }

  async handleBaleCallbackQuery(
    callbackQuery?: BaleCallbackQuery,
    updateId?: number
  ) {
    const chatId = callbackQuery?.message?.chat.id ?? 0;
    const data = callbackQuery?.data;

    await this.logEvent("incoming_callback", this.fromCallback(callbackQuery), {
      updateId,
      status: "success",
      raw: callbackQuery,
    });

    if (data !== "guide") return;

    await this.sendMessage(chatId, GUIDE_TEXT);
    await this.logEvent(
      "outgoing_message",
      {
        ...this.fromCallback(callbackQuery),
        chatId: String(chatId),
        text: GUIDE_TEXT,
        callbackData: data,
      },
      {
        status: "success",
        raw: { trigger: data, replyType: "guide" },
      },
    );
  }
}
