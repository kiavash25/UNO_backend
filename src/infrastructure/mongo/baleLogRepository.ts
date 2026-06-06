import type { BaleLogDoc, BaleLogEvent } from "./models/baleLogModel.js";
import { BaleLogModel } from "./models/baleLogModel.js";

export type BaleLogCreateInput = {
  event: BaleLogEvent;
  chatId?: string;
  baleUserId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  platformUserId?: string;
  platformDisplayName?: string;
  text?: string;
  callbackData?: string;
  messageId?: number;
  updateId?: number;
  status?: "success" | "error";
  errorMessage?: string;
  raw?: unknown;
};

export class BaleLogRepository {
  async create(input: BaleLogCreateInput): Promise<BaleLogDoc> {
    const created = await BaleLogModel.create(input);
    const log = await BaleLogModel.findById(created._id).lean<BaleLogDoc>().exec();
    if (!log) throw new Error("bale log persist failed");
    return log;
  }
}
