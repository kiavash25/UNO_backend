import { GameReportModel } from "./models/gameReportModel.js";

export class GameReportRepository {
  async upsert(report: Record<string, unknown>): Promise<void> {
    const roomId = String(report.roomId ?? "");
    if (!roomId) return;
    await GameReportModel.updateOne(
      { roomId },
      { $set: report },
      { upsert: true },
    ).exec();
  }
}
