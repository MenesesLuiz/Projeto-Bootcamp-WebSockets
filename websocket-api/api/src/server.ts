import { createServer } from "http";
import { app } from "./app";
import { createChatServer } from "./ws/socket-server";

const port = process.env.PORT || 3000;

// The WebSocket server upgrades connections on this same HTTP server -
// there's no separate port, just a different path (`/ws`).
const server = createServer(app);
createChatServer(server);

server.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
  console.log(`WebSocket running on ws://localhost:${port}/ws`);
});
