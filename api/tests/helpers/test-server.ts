import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { createChatServer, type ChatServer } from "../../src/ws/socket-server";

export type TestServer = {
  wsUrl: string;
  chat: ChatServer;
  close: () => Promise<void>;
};

/** Boots the chat server on an ephemeral port (0), for isolated tests. */
export async function startTestServer(): Promise<TestServer> {
  const server: Server = createServer();
  const chat = createChatServer(server);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  return {
    wsUrl: `ws://localhost:${port}/ws`,
    chat,
    close: () =>
      new Promise<void>((resolve) => {
        chat.stop();
        server.close(() => resolve());
      }),
  };
}
