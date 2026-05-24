import type { NextFunction, Request, Response } from "express";
import type { UserService } from "../../application/userService.js";

export function bearerAuth(userService: UserService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const raw = req.headers.authorization;
    const token = raw?.startsWith("Bearer ") ? raw.slice(7).trim() : null;
    if (!token) {
      res.status(401).json({ error: "unauthorized", message: "توکن نیاز است" });
      return;
    }
    try {
      req.authed = await userService.verifyAccessToken(token);
      next();
    } catch {
      res.status(401).json({ error: "unauthorized", message: "توکن نامعتبر است" });
    }
  };
}

export function optionalBearerAuth(userService: UserService) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const raw = req.headers.authorization;
    const token = raw?.startsWith("Bearer ") ? raw.slice(7).trim() : null;
    if (!token) {
      next();
      return;
    }
    try {
      req.authed = await userService.verifyAccessToken(token);
    } catch {
      // Guest room entry should still work when an optional token is stale.
    }
    next();
  };
}
