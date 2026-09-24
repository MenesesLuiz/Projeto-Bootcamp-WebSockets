import type { NextFunction, Request, Response } from "express";

const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

/**
 * Allows only ALLOWED_ORIGIN and short-circuits preflight (OPTIONS) requests.
 * Only covers plain HTTP routes (e.g. /health) - the WebSocket upgrade is
 * validated separately in `ws/socket-server.ts`, since browsers don't apply
 * CORS to WebSocket connections.
 */
export function cors(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
}
