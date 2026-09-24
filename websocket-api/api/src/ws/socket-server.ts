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

function sendEvent(socket: WebSocket, event: import("./protocol").ServerEvent): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
}

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

  function broadcastPresence(room: string): void {
    registry.broadcastToRoom(room, { type: "presence", usernames: registry.getUsernames(room) });
  }

  function broadcastRooms(): void {
    registry.broadcastToAll({ type: "rooms", rooms: registry.getRooms() });
  }

  async function handleMessage(socket: WebSocket, message: ClientMessage): Promise<void> {
    if (message.type === "join") {
      if (registry.get(socket)) {
        sendEvent(socket, { type: "error", message: "Esta conexão já entrou no chat" });
        return;
      }

      if (!registry.hasRoom(message.room)) {
        sendEvent(socket, { type: "error", message: `Sala inexistente: ${message.room}` });
        return;
      }

      if (registry.hasUsername(message.username)) {
        sendEvent(socket, { type: "error", message: `Nome já está em uso: ${message.username}` });
        return;
      }

      const client = registry.register(socket, message.username, message.room);
      log.info("client joined", { username: client.username, room: client.room });
      sendEvent(socket, { type: "joined", username: client.username, room: client.room });
      registry.broadcastToRoom(client.room, { type: "system", text: `${client.username} entrou no chat` });
      broadcastPresence(client.room);
      return;
    }

    const client = registry.get(socket);
    if (!client) {
      log.warn("chat message received before join, ignoring");
      return;
    }

    if (message.type === "create_room") {
      const room = registry.createRoom(message.name, client.id);
      if (!room) {
        sendEvent(socket, { type: "error", message: `A sala ${message.name} já existe` });
        return;
      }
      broadcastRooms();
      return;
    }

    if (message.type === "rename_room") {
      if (client.room === "global") {
        sendEvent(socket, { type: "error", message: "A sala global nao pode ser renomeada" });
        return;
      }

      const room = registry.getRoom(client.room);
      if (!room || room.ownerId !== client.id) {
        sendEvent(socket, { type: "error", message: "Apenas o proprietario pode renomear esta sala" });
        return;
      }

      if (registry.hasRoom(message.name)) {
        sendEvent(socket, { type: "error", message: `A sala ${message.name} ja existe` });
        return;
      }

      const oldName = client.room;
      if (!registry.renameRoom(oldName, message.name, client.id)) {
        sendEvent(socket, { type: "error", message: "Nao foi possivel renomear a sala" });
        return;
      }

      registry.broadcastToAll({ type: "room_renamed", oldName, newName: message.name });
      broadcastRooms();
      return;
    }

    if (message.type === "switch_room") {
      if (!registry.hasRoom(message.room)) {
        sendEvent(socket, { type: "error", message: `Sala inexistente: ${message.room}` });
        return;
      }
      const previousRoom = client.room;
      if (previousRoom === message.room) {
        sendEvent(socket, { type: "room_changed", room: message.room });
        return;
      }

      registry.moveToRoom(socket, message.room);
      sendEvent(socket, { type: "room_changed", room: message.room });

      registry.broadcastToRoom(previousRoom, {
        type: "system",
        text: `${client.username} saiu do chat`,
      });
      broadcastPresence(previousRoom);

      registry.broadcastToRoom(message.room, {
        type: "system",
        text: `${client.username} entrou no chat`,
      });
      broadcastPresence(message.room);
      return;
    }

    if (message.type === "typing") {
      registry.broadcastToRoom(
        client.room,
        { type: "typing", username: client.username, isTyping: message.isTyping },
        socket,
      );
      return;
    }

    registry.broadcastToRoom(client.room, {
      type: "chat",
      id: randomUUID(),
      username: client.username,
      text: message.text,
      createdAt: new Date().toISOString(),
    });

    if (mentionsAgent(message.text)) {
      await streamAgentReply(registry, client.room, message.text);
    }
  }

  wss.on("connection", (socket: WebSocket) => {
    log.info("client connected", { totalClients: wss.clients.size });
    sendEvent(socket, { type: "rooms", rooms: registry.getRooms() });

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
        log.info("client disconnected", { username: client.username, room: client.room });
        registry.broadcastToRoom(client.room, { type: "system", text: `${client.username} saiu do chat` });
        broadcastPresence(client.room);
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
