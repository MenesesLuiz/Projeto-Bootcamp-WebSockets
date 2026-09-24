import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";

const log = logger.child("http");

/**
 * Assigns each request a correlation id and logs its start/end, so every
 * API call is traceable end-to-end without touching route code.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  const startedAt = process.hrtime.bigint();

  res.setHeader("X-Request-Id", requestId);

  log.info("request received", {
    requestId,
    method: req.method,
    path: req.originalUrl,
  });

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    log.info("request completed", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });

  next();
}
