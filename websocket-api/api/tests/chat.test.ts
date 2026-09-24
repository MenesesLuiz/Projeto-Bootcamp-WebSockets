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

function join(socket: WebSocket, username: string, room = "global"): void {
  socket.send(JSON.stringify({ type: "join", username, room }));
}

function say(socket: WebSocket, text: string): void {
  socket.send(JSON.stringify({ type: "chat", text }));
}

function setTyping(socket: WebSocket, isTyping: boolean): void {
  socket.send(JSON.stringify({ type: "typing", isTyping }));
}

function switchRoom(socket: WebSocket, room: string): void {
  socket.send(JSON.stringify({ type: "switch_room", room }));
}

function createRoom(socket: WebSocket, name: string): void {
  socket.send(JSON.stringify({ type: "create_room", name }));
}

function renameRoom(socket: WebSocket, name: string): void {
  socket.send(JSON.stringify({ type: "rename_room", name }));
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

  async function openClient(
    username: string,
    room = "global",
  ): Promise<{ socket: WebSocket; events: MessageCollector }> {
    const socket = await connect(server.wsUrl);
    sockets.push(socket);
    const events = new MessageCollector(socket);
    join(socket, username, room);
    await events.waitFor((event) => event.type === "system" && event.text.includes(`${username} entrou`));
    return { socket, events };
  }

  it("broadcasts a system message to existing clients when someone joins", async () => {
    const bob = await openClient("bob");
    await openClient("alice");

    const event = await bob.events.waitFor((e) => e.type === "system" && e.text === "alice entrou no chat");
    expect(event).toEqual({ type: "system", text: "alice entrou no chat" });
  });

  it("broadcasts the online users when someone joins or leaves", async () => {
    const bob = await openClient("bob");
    await bob.events.waitFor((event) => event.type === "presence" && event.usernames.join() === "bob");

    const alice = await openClient("alice");
    const joined = await bob.events.waitFor(
      (event) => event.type === "presence" && event.usernames.join() === "bob,alice",
    );
    expect(joined).toEqual({ type: "presence", usernames: ["bob", "alice"] });

    alice.socket.close();
    const left = await bob.events.waitFor(
      (event) => event.type === "presence" && event.usernames.join() === "bob",
    );
    expect(left).toEqual({ type: "presence", usernames: ["bob"] });
  });

  it("rejects duplicate usernames without considering case and frees the name after disconnect", async () => {
    const alice = await openClient("Alice");
    const duplicateSocket = await connect(server.wsUrl);
    sockets.push(duplicateSocket);
    const duplicateEvents = new MessageCollector(duplicateSocket);

    join(duplicateSocket, "alice");

    await expect(duplicateEvents.waitFor((event) => event.type === "error")).resolves.toEqual({
      type: "error",
      message: "Nome já está em uso: alice",
    });
    expect(duplicateEvents.all().some((event) => event.type === "joined")).toBe(false);

    const observer = await openClient("observer");
    alice.socket.close();
    await observer.events.waitFor((event) => event.type === "system" && event.text === "Alice saiu do chat");

    await openClient("alice");
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

  it("keeps chat and agent events inside the sender's room", async () => {
    const alice = await openClient("alice", "global");
    const carol = await openClient("carol", "global");
    createRoom(alice.socket, "private-room");
    await alice.events.waitFor((event) => event.type === "rooms" && event.rooms.includes("private-room"));
    const bob = await openClient("bob", "private-room");

    say(bob.socket, "mensagem privada da sala");
    await expect(
      alice.events.waitFor((event) => event.type === "chat" && event.username === "bob", 250),
    ).rejects.toThrow();

    say(bob.socket, "oi @agente");
    await expect(alice.events.waitFor((event) => event.type === "agent_start", 250)).rejects.toThrow();
    await bob.events.waitFor((event) => event.type === "agent_end", 5000);

    say(alice.socket, "mensagem da global");
    const received = await carol.events.waitFor((event) => event.type === "chat");
    expect(received).toMatchObject({ username: "alice", text: "mensagem da global" });
  });

  it("moves a client between rooms and updates each room's presence", async () => {
    const alice = await openClient("alice", "global");
    const bob = await openClient("bob", "global");
    createRoom(alice.socket, "room-to-join");
    await alice.events.waitFor((event) => event.type === "rooms" && event.rooms.includes("room-to-join"));
    const carol = await openClient("carol", "room-to-join");

    switchRoom(alice.socket, "room-to-join");

    const changed = await alice.events.waitFor((event) => event.type === "room_changed");
    expect(changed).toEqual({ type: "room_changed", room: "room-to-join" });

    await bob.events.waitFor((event) => event.type === "system" && event.text === "alice saiu do chat");
    await carol.events.waitFor((event) => event.type === "system" && event.text === "alice entrou no chat");

    say(alice.socket, "agora estou na nova sala");
    const received = await carol.events.waitFor((event) => event.type === "chat");
    expect(received).toMatchObject({ username: "alice", text: "agora estou na nova sala" });
    await expect(
      bob.events.waitFor((event) => event.type === "chat" && event.username === "alice", 250),
    ).rejects.toThrow();
  });

  it("creates a room and broadcasts the updated room catalog", async () => {
    const alice = await openClient("alice");
    const bob = await openClient("bob");

    createRoom(alice.socket, "workshop");

    const aliceRooms = await alice.events.waitFor(
      (event) => event.type === "rooms" && event.rooms.includes("workshop"),
    );
    const bobRooms = await bob.events.waitFor(
      (event) => event.type === "rooms" && event.rooms.includes("workshop"),
    );

    expect(aliceRooms).toMatchObject({ rooms: ["global", "workshop"] });
    expect(bobRooms).toMatchObject({ rooms: ["global", "workshop"] });
    expect(server.chat.registry.getRoom("workshop")).toMatchObject({
      name: "workshop",
      ownerId: expect.any(String),
    });
  });

  it("rejects duplicate room names without changing the catalog", async () => {
    const alice = await openClient("alice");
    const bob = await openClient("bob");

    createRoom(alice.socket, "Workshop");
    await alice.events.waitFor((event) => event.type === "rooms" && event.rooms.includes("Workshop"));

    createRoom(bob.socket, "workshop");
    const error = await bob.events.waitFor((event) => event.type === "error");
    expect(error).toEqual({ type: "error", message: "A sala workshop já existe" });
  });

  it("renames a room and updates every client that is inside it", async () => {
    const alice = await openClient("alice");
    createRoom(alice.socket, "workshop");
    await alice.events.waitFor((event) => event.type === "rooms" && event.rooms.includes("workshop"));
    switchRoom(alice.socket, "workshop");
    await alice.events.waitFor((event) => event.type === "room_changed");
    const bob = await openClient("bob", "workshop");

    renameRoom(alice.socket, "backend");

    const renamed = await bob.events.waitFor((event) => event.type === "room_renamed");
    expect(renamed).toEqual({ type: "room_renamed", oldName: "workshop", newName: "backend" });
    await bob.events.waitFor((event) => event.type === "rooms" && event.rooms.includes("backend"));

    say(bob.socket, "mensagem depois da renomeacao");
    const received = await alice.events.waitFor((event) => event.type === "chat");
    expect(received).toMatchObject({ username: "bob", text: "mensagem depois da renomeacao" });
    expect(server.chat.registry.getRoom("backend")).toMatchObject({ name: "backend" });
    expect(server.chat.registry.getRoom("workshop")).toBeUndefined();
  });

  it("allows only the room owner to rename it and protects global", async () => {
    const alice = await openClient("alice");
    createRoom(alice.socket, "workshop");
    await alice.events.waitFor((event) => event.type === "rooms" && event.rooms.includes("workshop"));
    const bob = await openClient("bob", "workshop");

    renameRoom(bob.socket, "not-allowed");
    await expect(bob.events.waitFor((event) => event.type === "error")).resolves.toEqual({
      type: "error",
      message: "Apenas o proprietario pode renomear esta sala",
    });

    renameRoom(alice.socket, "renamed-global");
    await expect(alice.events.waitFor((event) => event.type === "error")).resolves.toEqual({
      type: "error",
      message: "A sala global nao pode ser renomeada",
    });
  });

  it("relays typing status to everyone except the sender", async () => {
    const alice = await openClient("alice");
    const bob = await openClient("bob");

    setTyping(alice.socket, true);
    await expect(alice.events.waitFor((event) => event.type === "typing", 250)).rejects.toThrow();

    const started = await bob.events.waitFor((event) => event.type === "typing");
    expect(started).toEqual({ type: "typing", username: "alice", isTyping: true });

    setTyping(alice.socket, false);
    const stopped = await bob.events.waitFor((event) => event.type === "typing" && !event.isTyping);
    expect(stopped).toEqual({ type: "typing", username: "alice", isTyping: false });
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
