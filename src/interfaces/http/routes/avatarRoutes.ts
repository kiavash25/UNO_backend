import { Router } from "express";
import { AVATAR_OPTIONS } from "../../../constant/avatar.cons.js";

export function createAvatarRouter(): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const origin = `${req.protocol}://${req.get("host")}`;
    const avatars = AVATAR_OPTIONS.map((avatar, index) => ({
      id: avatar,
      url: new URL(avatar, origin).toString(),
      order: index + 1,
    }));

    res.json({
      count: avatars.length,
      avatars,
    });
  });

  return router;
}
