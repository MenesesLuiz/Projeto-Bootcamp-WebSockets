import type { WebSocket, WebSocketServer } from "ws";
import { logger } from "../utils/logger";

const log = logger.child("ws:heartbeat");
const PING_INTERVAL_MS = 30_000;

interface HeartbeatSocket extends WebSocket {
  isAlive?: boolean;
}

/**
 * Standard `ws` keepalive pattern: every connected client is pinged on an
 * interval. If it doesn't answer with a pong before the next tick, the
 * connection is treated as dead (laptop slept, network dropped, tab was
 * killed) and gets terminated instead of lingering forever.
 */
export function startHeartbeat(wss: WebSocketServer): () => void {
  wss.on("connection", (socket: HeartbeatSocket) => {
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });
  });

  const interval = setInterval(() => {
    for (const socket of wss.clients as Set<HeartbeatSocket>) {
      if (socket.isAlive === false) {
        log.info("terminating unresponsive connection");
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, PING_INTERVAL_MS);

  return () => clearInterval(interval);
}
