import type express from "express";
import { z } from "zod";
import { AppError } from "../../application/errors.js";

export function handleHttpError(
  e: unknown,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
): void {
  if (e instanceof z.ZodError) {
    res.status(400).json({ error: "validation", details: e.flatten() });
    return;
  }
  if (e instanceof AppError) {
    res.status(e.status).json({ error: e.code, message: e.message });
    return;
  }
  console.error(e);
  res.status(500).json({ error: "internal" });
}

