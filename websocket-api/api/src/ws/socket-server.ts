import { randomUUID } from "crypto";
import type { IncomingMessage, Server as HttpServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { ConnectionRegistry, sendEvent } from "./connection-registry";
import { mentionsAgent, streamAgentReply } from "./agent";
import { startHeartbeat } from "./heartbeat";
import { parseClientMessage, type ClientMessage } from "./protocol";
import { logger } from "../utils/logger";

const log = logger.child("ws");
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
const MAX_FRAME_BYTES = 8 * 1024;
const MAX_CONNECTIONS = 100;
const MAX_CONNECTIONS_PER_IP = 10;
const RATE_LIMIT_WINDOW_MS = 10_000;
const MAX_MESSAGES_PER_WINDOW = 30;

type RateBucket = {
  startedAt: number;
  count: number;
};

function getClientIp(request: IncomingMessage): string {
  return request.socket.remoteAddress || "unknown";
}

function consumeRateLimit<T>(buckets: Map<T, RateBucket>, key: T): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return true;
  }

  if (bucket.count >= MAX_MESSAGES_PER_WINDOW) return false;
  bucket.count += 1;
  return true;
}

export type ChatServer = {
  wss: WebSocketServer;
  registry: ConnectionRegistry;
  stop: () => void;
};

/** Wires the chat WebSocket server on top of an existing HTTP server, at `/ws`. */
export function createChatServer(server: HttpServer): ChatServer {
  const connectionsByIp = new Map<string, number>();
  const messageBucketsBySocket = new Map<WebSocket, RateBucket>();
  const messageBucketsByIp = new Map<string, RateBucket>();

  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: MAX_FRAME_BYTES,
    verifyClient: (info, callback) => {
      // Browsers don't block cross-origin WebSocket connections on their own
      // (unlike fetch/XHR, which CORS covers) - the server has to check the
      // Origin header itself if it wants to reject unexpected callers.
      const ip = getClientIp(info.req);
      const connectionsFromIp = connectionsByIp.get(ip) || 0;

      if (wss.clients.size >= MAX_CONNECTIONS) {
        log.warn("rejected connection limit", { totalClients: wss.clients.size });
        callback(false, 503, "Too many connections");
        return;
      }

      if (connectionsFromIp >= MAX_CONNECTIONS_PER_IP) {
        log.warn("rejected per-ip connection limit", { ip });
        callback(false, 429, "Too many connections from this IP");
        return;
      }

      const allowed = !info.origin || info.origin === ALLOWED_ORIGIN;
      if (!allowed) {
        log.warn("rejected connection from disallowed origin", { origin: info.origin });
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

    if (message.type === "delete_room") {
      const room = registry.getRoom(message.name);
      if (!room) {
        sendEvent(socket, { type: "error", message: `Sala inexistente: ${message.name}` });
        return;
      }
      if (room.name === "global") {
        sendEvent(socket, { type: "error", message: "A sala global nao pode ser excluida" });
        return;
      }
      if (room.ownerId !== client.id) {
        sendEvent(socket, { type: "error", message: "Apenas o proprietario pode excluir esta sala" });
        return;
      }

      const deletedRoom = registry.deleteRoom(room.name, client.id);
      if (!deletedRoom) {
        sendEvent(socket, { type: "error", message: "Nao foi possivel excluir a sala" });
        return;
      }

      for (const { socket: affectedSocket } of deletedRoom.affectedClients) {
        sendEvent(affectedSocket, { type: "room_changed", room: "global" });
      }
      registry.broadcastToAll({ type: "room_deleted", room: deletedRoom.name, fallbackRoom: "global" });
      registry.broadcastToRoom("global", {
        type: "system",
        text: `A sala ${deletedRoom.name} foi excluida; usuarios retornaram para a global`,
      });
      broadcastPresence("global");
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

  wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
    const ip = getClientIp(request);
    connectionsByIp.set(ip, (connectionsByIp.get(ip) || 0) + 1);
    log.info("client connected", { totalClients: wss.clients.size });
    sendEvent(socket, { type: "rooms", rooms: registry.getRooms() });

    socket.on("error", (error) => {
      log.warn("socket error", { message: error.message });
    });

    socket.on("message", (raw) => {
      if (
        !consumeRateLimit(messageBucketsBySocket, socket) ||
        !consumeRateLimit(messageBucketsByIp, ip)
      ) {
        sendEvent(socket, { type: "error", message: "Limite de mensagens excedido" });
        socket.close(1008, "Rate limit exceeded");
        return;
      }

      const parsed = parseClientMessage(raw.toString());

      if (!parsed.success) {
        log.warn("dropped invalid message", { error: parsed.error });
        return;
      }

      void handleMessage(socket, parsed.data);
    });

    socket.on("close", () => {
      messageBucketsBySocket.delete(socket);
      const remainingConnections = (connectionsByIp.get(ip) || 1) - 1;
      if (remainingConnections <= 0) {
        connectionsByIp.delete(ip);
        messageBucketsByIp.delete(ip);
      } else {
        connectionsByIp.set(ip, remainingConnections);
      }

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
