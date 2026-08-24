import { randomUUID } from "crypto";
import type { WebSocket } from "ws";
import type { ServerEvent } from "./protocol";

export type ChatClient = {
  id: string;
  username: string;
};

/**
 * Tracks connected sockets and broadcasts events to all of them. This is
 * the in-memory equivalent of the `expenses` array from the REST workshop:
 * fine for a single-process demo, gone on restart.
 */
export class ConnectionRegistry {
  private readonly clients = new Map<WebSocket, ChatClient>();

  /** Registers a socket once it has sent a valid `join` message. */
  register(socket: WebSocket, username: string): ChatClient {
    const client: ChatClient = { id: randomUUID(), username };
    this.clients.set(socket, client);
    return client;
  }

  get(socket: WebSocket): ChatClient | undefined {
    return this.clients.get(socket);
  }

  unregister(socket: WebSocket): ChatClient | undefined {
    const client = this.clients.get(socket);
    this.clients.delete(socket);
    return client;
  }

  get size(): number {
    return this.clients.size;
  }

  /** Sends `event` to every connected client whose socket is still open. */
  broadcast(event: ServerEvent): void {
    const payload = JSON.stringify(event);
    for (const socket of this.clients.keys()) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }
}
