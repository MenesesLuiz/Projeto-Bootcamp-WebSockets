import type WebSocket from "ws";
import type { ServerEvent } from "../../src/ws/protocol";

/**
 * Buffers every event a test socket receives and lets tests await a
 * specific one by predicate, instead of racing a single `on("message")`
 * callback against `send()` calls.
 */
export class MessageCollector {
  private readonly received: ServerEvent[] = [];

  constructor(socket: WebSocket) {
    socket.on("message", (raw) => {
      this.received.push(JSON.parse(raw.toString()) as ServerEvent);
    });
  }

  async waitFor(predicate: (event: ServerEvent) => boolean, timeoutMs = 2000): Promise<ServerEvent> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const found = this.received.find(predicate);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Timed out waiting for a matching WebSocket event");
  }

  all(): ServerEvent[] {
    return this.received;
  }
}
