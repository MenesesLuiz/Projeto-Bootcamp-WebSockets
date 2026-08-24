import { randomUUID } from "crypto";
import type { Server as HttpServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { ConnectionRegistry } from "./connection-registry";
import { mentionsAgent, streamAgentReply } from "./agent";
import { startHeartbeat } from "./heartbeat";
import { parseClientMessage, type ClientMessage } from "./protocol";
import { logger } from "../utils/logger";

const log = logger.child("ws");
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

export type ChatServer = {
  wss: WebSocketServer;
  registry: ConnectionRegistry;
  stop: () => void;
};

/** Wires the chat WebSocket server on top of an existing HTTP server, at `/ws`. */
export function createChatServer(server: HttpServer): ChatServer {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    verifyClient: ({ origin }, callback) => {
      // Browsers don't block cross-origin WebSocket connections on their own
      // (unlike fetch/XHR, which CORS covers) - the server has to check the
      // Origin header itself if it wants to reject unexpected callers.
      const allowed = !origin || origin === ALLOWED_ORIGIN;
      if (!allowed) {
        log.warn("rejected connection from disallowed origin", { origin });
      }
      callback(allowed, 403, "Forbidden");
    },
  });

  const registry = new ConnectionRegistry();
  const stopHeartbeat = startHeartbeat(wss);

  async function handleMessage(socket: WebSocket, message: ClientMessage): Promise<void> {
    if (message.type === "join") {
      const client = registry.register(socket, message.username);
      log.info("client joined", { username: client.username });
      registry.broadcast({ type: "system", text: `${client.username} entrou no chat` });
      return;
    }

    const client = registry.get(socket);
    if (!client) {
      log.warn("chat message received before join, ignoring");
      return;
    }

    registry.broadcast({
      type: "chat",
      id: randomUUID(),
      username: client.username,
      text: message.text,
      createdAt: new Date().toISOString(),
    });

    if (mentionsAgent(message.text)) {
      await streamAgentReply(registry, message.text);
    }
  }

  wss.on("connection", (socket: WebSocket) => {
    log.info("client connected", { totalClients: wss.clients.size });

    socket.on("message", (raw) => {
      const parsed = parseClientMessage(raw.toString());

      if (!parsed.success) {
        log.warn("dropped invalid message", { error: parsed.error });
        return;
      }

      void handleMessage(socket, parsed.data);
    });

    socket.on("close", () => {
      const client = registry.unregister(socket);
      if (client) {
        log.info("client disconnected", { username: client.username });
        registry.broadcast({ type: "system", text: `${client.username} saiu do chat` });
      }
    });
  });

  return {
    wss,
    registry,
    stop: () => {
      stopHeartbeat();
      wss.close();
    },
  };
}
