import type { RoomSettings } from "../../application/roomTypes.js";
import { RoomModel, type RoomDoc } from "./models/roomModel.js";

export class RoomRepository {
  async create(params: {
    code: string;
    hostPlayerId: string;
    settings: RoomSettings;
  }): Promise<RoomDoc> {
    const doc = await RoomModel.create({
      code: params.code,
      name: params.settings.name,
      maxPlayers: params.settings.maxPlayers,
      mode: params.settings.mode,
      isPrivate: params.settings.isPrivate,
      turnTimeoutSec: params.settings.turnTimeoutSec,
      hostPlayerId: params.hostPlayerId,
    });
    return doc;
  }

  async findByCode(code: string): Promise<RoomDoc | null> {
    return RoomModel.findOne({ code }).lean<RoomDoc>().exec();
  }
}
