import type express from "express";
import type { BaleService } from "../../../application/baleService.js";

export class BaleController {
  constructor(private readonly baleService: BaleService) {}

  create: express.RequestHandler = async (req, res) => {
    try {
      const update = req.body;

      const message = update.message;
      const callbackQuery = update.callback_query;

      console.log(1111, message)
      console.log(2222, update)

      if (message) {
        const chatId = message.chat.id;
        const text = message.text;

        if (text === "/start") {
          await this.baleService.sendBaleMessage(
            chatId,
            `سلام 👋

به Cardix خوش اومدی 🎮

اینجا می‌تونی بازی‌های کارتی و دورهمی رو آنلاین بازی کنی.
فعلاً با UNO شروع کردیم.

👇 از دکمه‌های زیر شروع کن:`,
            this.baleService.startInlineKeyboard,
          );
        }
      }

      if (callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;

        if (data === "guide") {
          await this.baleService.sendBaleMessage(
            chatId,
            `📘 راهنمای سریع UNO

کارت هم‌رنگ یا هم‌عدد بنداز.
اگه کارت مناسب نداری، کارت بکش.
اولین کسی که کارت‌هاش تموم بشه برنده‌ست 🏆`,
          );
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error("Bale webhook error:", error);
      res.sendStatus(500);
    }
  };
}
