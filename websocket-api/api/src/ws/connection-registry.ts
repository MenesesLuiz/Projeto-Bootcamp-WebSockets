import { randomUUID } from "crypto";
import type { WebSocket } from "ws";
import type { ServerEvent } from "./protocol";

export type ChatClient = {
  id: string;
  username: string;
  room: string;
};

/**
 * Tracks connected sockets and broadcasts events to all of them. This is
 * the in-memory equivalent of the `expenses` array from the REST workshop:
 * fine for a single-process demo, gone on restart.
 */
export class ConnectionRegistry {
  private readonly clients = new Map<WebSocket, ChatClient>();
  private readonly rooms = new Map<string, string>([
    ["global", "global"],
    ["sala-2", "sala-2"],
  ]);

  /** Registers a socket once it has sent a valid `join` message. */
  register(socket: WebSocket, username: string, room: string): ChatClient {
    const client: ChatClient = { id: randomUUID(), username, room };
    this.clients.set(socket, client);
    return client;
  }

  get(socket: WebSocket): ChatClient | undefined {
    return this.clients.get(socket);
  }

  moveToRoom(socket: WebSocket, room: string): ChatClient | undefined {
    const client = this.clients.get(socket);
    if (client) client.room = room;
    return client;
  }

  hasRoom(room: string): boolean {
    return this.rooms.has(this.roomKey(room));
  }

  createRoom(name: string): string | undefined {
    const key = this.roomKey(name);
    if (this.rooms.has(key)) return undefined;
    this.rooms.set(key, name);
    return name;
  }

  getRooms(): string[] {
    return [...this.rooms.values()];
  }

  unregister(socket: WebSocket): ChatClient | undefined {
    const client = this.clients.get(socket);
    this.clients.delete(socket);
    return client;
  }

  get size(): number {
    return this.clients.size;
  }

  /** Returns one username per active connection in `room`; duplicate names are allowed. */
  getUsernames(room: string): string[] {
    return Array.from(this.clients.values())
      .filter((client) => client.room === room)
      .map(({ username }) => username);
  }

  /** Sends `event` to connected clients in `room`, optionally excluding one socket. */
  broadcastToRoom(room: string, event: ServerEvent, excludedSocket?: WebSocket): void {
    const payload = JSON.stringify(event);
    for (const [socket, client] of this.clients) {
      if (client.room === room && socket !== excludedSocket && socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }

  /** Sends a catalog event to every connected client, regardless of room. */
  broadcastToAll(event: ServerEvent): void {
    const payload = JSON.stringify(event);
    for (const socket of this.clients.keys()) {
      if (socket.readyState === socket.OPEN) socket.send(payload);
    }
  }

  private roomKey(room: string): string {
    return room.toLocaleLowerCase();
  }
}
