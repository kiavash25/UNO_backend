// src/bale/bale.service.ts
import axios from "axios";

const BALE_BOT_TOKEN = process.env.BALE_BOT_TOKEN!;
const BALE_API_URL = `https://tapi.bale.ai/bot${BALE_BOT_TOKEN}`;

export class BaleService {
  constructor() {}

  startInlineKeyboard = {
  inline_keyboard: [
    [
      {
        text: "🎮 شروع بازی",
        url: "https://cardix.ir",
      },
    ],
    [
      {
        text: "👥 بازی با دوستام",
        url: "https://cardix.ir/room",
      },
    ],
    [
      {
        text: "📢 کانال کاردیکس",
        url: "https://ble.ir/YOUR_CHANNEL",
      },
    ],
    [
      {
        text: "📘 راهنمای سریع",
        callback_data: "guide",
      },
    ],
  ],
};

  sendBaleMessage = (
    chatId: number | string,
    text: string,
    replyMarkup?: unknown,
  ) => {
    return axios.post(`${BALE_API_URL}/sendMessage`, {
      chat_id: chatId,
      text,
      reply_markup: replyMarkup,
    });
  };
}
