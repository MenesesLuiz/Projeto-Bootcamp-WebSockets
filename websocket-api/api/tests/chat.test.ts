import WebSocket from "ws";
import { startTestServer, type TestServer } from "./helpers/test-server";
import { MessageCollector } from "./helpers/message-collector";
import type { AgentChunkEvent, ChatEvent } from "../src/ws/protocol";

function connect(wsUrl: string, options?: WebSocket.ClientOptions): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl, options);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function join(socket: WebSocket, username: string): void {
  socket.send(JSON.stringify({ type: "join", username }));
}

function say(socket: WebSocket, text: string): void {
  socket.send(JSON.stringify({ type: "chat", text }));
}

describe("chat WebSocket", () => {
  let server: TestServer;
  let sockets: WebSocket[];

  beforeEach(async () => {
    server = await startTestServer();
    sockets = [];
  });

  afterEach(async () => {
    for (const socket of sockets) {
      socket.close();
    }
    await server.close();
  });

  async function openClient(username: string): Promise<{ socket: WebSocket; events: MessageCollector }> {
    const socket = await connect(server.wsUrl);
    sockets.push(socket);
    const events = new MessageCollector(socket);
    join(socket, username);
    await events.waitFor((event) => event.type === "system" && event.text.includes(`${username} entrou`));
    return { socket, events };
  }

  it("broadcasts a system message to existing clients when someone joins", async () => {
    const bob = await openClient("bob");
    await openClient("alice");

    const event = await bob.events.waitFor((e) => e.type === "system" && e.text === "alice entrou no chat");
    expect(event).toEqual({ type: "system", text: "alice entrou no chat" });
  });

  it("broadcasts a chat message to every connected client", async () => {
    const alice = await openClient("alice");
    const bob = await openClient("bob");

    say(alice.socket, "oi bob, tudo bem?");

    const received = (await bob.events.waitFor((e) => e.type === "chat")) as ChatEvent;
    expect(received).toMatchObject({ type: "chat", username: "alice", text: "oi bob, tudo bem?" });
    expect(typeof received.id).toBe("string");
    expect(typeof received.createdAt).toBe("string");
  });

  it("ignores a chat message sent before joining", async () => {
    const observer = await openClient("observer");
    const socket = await connect(server.wsUrl);
    sockets.push(socket);

    say(socket, "não deveria aparecer para ninguém");
    say(observer.socket, "essa sim deveria chegar");

    const received = (await observer.events.waitFor((e) => e.type === "chat")) as ChatEvent;
    expect(received.text).toBe("essa sim deveria chegar");
  });

  it("does not trigger the agent unless it is mentioned", async () => {
    const alice = await openClient("alice");

    say(alice.socket, "oi pessoal, tudo bem?");

    // Nothing definitively proves an absence, so instead we prove the
    // positive case is fast (see the next test) and give plenty of margin
    // here before concluding no agent_start is coming.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(alice.events.all().some((e) => e.type === "agent_start")).toBe(false);
  });

  it(
    "streams the agent reply as start, one or more chunks, then end - when mentioned",
    async () => {
      const alice = await openClient("alice");

      say(alice.socket, "oi @agente, tudo bem?");

      const end = await alice.events.waitFor((e) => e.type === "agent_end", 5000);
      const agentId = (end as { id: string }).id;

      const events = alice.events.all();
      const startIndex = events.findIndex((e) => e.type === "agent_start" && e.id === agentId);
      const endIndex = events.findIndex((e) => e.type === "agent_end" && e.id === agentId);
      const chunks = events.filter(
        (e): e is AgentChunkEvent => e.type === "agent_chunk" && e.id === agentId,
      );

      expect(startIndex).toBeGreaterThanOrEqual(0);
      expect(chunks.length).toBeGreaterThan(0);
      expect(endIndex).toBeGreaterThan(startIndex);
      expect(chunks.join("").trim().length).toBeGreaterThan(0);
    },
    8000,
  );

  it(
    "recognizes the mention regardless of case",
    async () => {
      const alice = await openClient("alice");

      say(alice.socket, "Oi @AGENTE!");

      const start = await alice.events.waitFor((e) => e.type === "agent_start", 2000);
      expect(start).toBeTruthy();

      // Drain the rest of the stream so its pending `setTimeout` chain
      // doesn't outlive this test (see afterEach closing the server above).
      await alice.events.waitFor((e) => e.type === "agent_end", 5000);
    },
    8000,
  );

  it("keeps working after receiving a malformed frame", async () => {
    const alice = await openClient("alice");
    const bob = await openClient("bob");

    alice.socket.send("this is not json");
    say(alice.socket, "ainda funciona depois de uma mensagem inválida");

    const received = (await bob.events.waitFor((e) => e.type === "chat")) as ChatEvent;
    expect(received.text).toBe("ainda funciona depois de uma mensagem inválida");
  });

  it("broadcasts a system message when a client disconnects", async () => {
    const alice = await openClient("alice");
    const bob = await openClient("bob");

    alice.socket.close();

    const event = await bob.events.waitFor((e) => e.type === "system" && e.text.includes("alice saiu"));
    expect(event).toEqual({ type: "system", text: "alice saiu do chat" });
  });

  it("rejects the handshake when the Origin header is not allowed", async () => {
    const statusCode = await new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(server.wsUrl, { origin: "http://evil.example" });
      socket.once("open", () => reject(new Error("connection should have been rejected")));
      socket.once("unexpected-response", (_req, res) => resolve(res.statusCode as number));
      socket.once("error", () => {
        // The rejected handshake also surfaces as a socket error; the
        // assertion happens on "unexpected-response" above.
      });
    });

    expect(statusCode).toBe(403);
  });
});
