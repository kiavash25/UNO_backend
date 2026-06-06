import type express from "express";
import type { BaleCallbackQuery, BaleMessage, BaleService } from "../../../application/baleService.js";

type BaleWebhookUpdate = {
  update_id?: number;
  message?: BaleMessage;
  callback_query?: BaleCallbackQuery;
};

type ErrorLogPayload = Parameters<BaleService["logWebhookError"]>[0];

export class BaleController {
  constructor(private readonly baleService: BaleService) {}

  private buildErrorLog(update: BaleWebhookUpdate, error: unknown): ErrorLogPayload {
    const message = update.message;
    const callbackQuery = update.callback_query;

    return {
      updateId: update.update_id,
      chatId:
        message?.chat.id !== undefined
          ? String(message.chat.id)
          : callbackQuery?.message?.chat.id !== undefined
            ? String(callbackQuery.message.chat.id)
            : undefined,
      baleUserId:
        message?.from?.id !== undefined
          ? String(message.from.id)
          : callbackQuery?.from?.id !== undefined
            ? String(callbackQuery.from.id)
            : undefined,
      username: message?.from?.username ?? callbackQuery?.from?.username,
      firstName: message?.from?.first_name ?? callbackQuery?.from?.first_name,
      lastName: message?.from?.last_name ?? callbackQuery?.from?.last_name,
      text: message?.text ?? callbackQuery?.message?.text,
      callbackData: callbackQuery?.data,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      raw: update,
    };
  }

  create: express.RequestHandler = async (req, res) => {
    try {
      const update = req.body as BaleWebhookUpdate;

      if (update.message?.text) {
        await this.baleService.handleBaleMessageText(
          update.message,
          update.update_id
        );
      }

      if (update.callback_query?.message?.chat.id && update.callback_query.data) {
        await this.baleService.handleBaleCallbackQuery(
          update.callback_query,
          update.update_id,
        );
      }

      res.sendStatus(200);
    } catch (error) {
      const update = req.body as BaleWebhookUpdate;
      await this.baleService.logWebhookError(this.buildErrorLog(update, error));
      console.error("Bale webhook error:", error);
      res.sendStatus(500);
    }
  };
}
