import { useCallback, useEffect, useRef, useState } from "react";
import type { Bubble, ConnectionStatus, ServerEvent } from "./types";

// In dev, the API runs on its own port (see api/.env.example). In the
// deployed image, the API serves this app itself (see ../Dockerfile), so
// the WebSocket is reachable on that same origin - no build-time URL to
// bake in, since the deploy's public address isn't known at build time.
const WS_URL = import.meta.env.DEV
  ? "ws://localhost:3000/ws"
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
const TYPING_STOP_DELAY_MS = 800;
const REMOTE_TYPING_TIMEOUT_MS = 2000;

// `crypto.randomUUID()` only exists in secure contexts (HTTPS, or
// localhost) - the deployed demo is plain HTTP on a non-localhost host on
// purpose (see docs/deploy.md), so it's unavailable there. This id is only
// ever a React list key for system messages, not used for anything
// security-sensitive, so a short random string is enough.
function randomId(): string {
  return Math.random().toString(36).slice(2);
}

/**
 * Owns the WebSocket connection and turns raw server events into the
 * `Bubble[]` the chat list renders. A ref (not state) holds the socket and
 * the local username, since neither should trigger a re-render on its own.
 */
export function useChatSocket() {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [currentRoom, setCurrentRoom] = useState("global");
  const [availableRooms, setAvailableRooms] = useState<string[]>([]);
  const [roomError, setRoomError] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const usernameRef = useRef("");
  const typingActiveRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.addEventListener("open", () => setStatus("open"));
    socket.addEventListener("close", () => setStatus("closed"));
    socket.addEventListener("error", () => setStatus("closed"));

    socket.addEventListener("message", (event) => {
      const serverEvent = JSON.parse(event.data as string) as ServerEvent;

      if (serverEvent.type === "room_changed") {
        setCurrentRoom(serverEvent.room);
        setBubbles([]);
        setOnlineUsers([]);
        setTypingUsers([]);
        return;
      }

      if (serverEvent.type === "rooms") {
        setAvailableRooms(serverEvent.rooms);
        setRoomError("");
        return;
      }

      if (serverEvent.type === "error") {
        setRoomError(serverEvent.message);
        return;
      }

      if (serverEvent.type === "presence") {
        setOnlineUsers(serverEvent.usernames);
        return;
      }

      if (serverEvent.type === "typing") {
        const previousTimer = remoteTypingTimersRef.current.get(serverEvent.username);
        if (previousTimer) clearTimeout(previousTimer);

        if (serverEvent.isTyping) {
          setTypingUsers((current) =>
            current.includes(serverEvent.username) ? current : [...current, serverEvent.username],
          );

          const timer = setTimeout(() => {
            setTypingUsers((current) => current.filter((username) => username !== serverEvent.username));
            remoteTypingTimersRef.current.delete(serverEvent.username);
          }, REMOTE_TYPING_TIMEOUT_MS);
          remoteTypingTimersRef.current.set(serverEvent.username, timer);
        } else {
          setTypingUsers((current) => current.filter((username) => username !== serverEvent.username));
          remoteTypingTimersRef.current.delete(serverEvent.username);
        }
        return;
      }

      setBubbles((current) => {
        switch (serverEvent.type) {
          case "system":
            return [...current, { kind: "system", id: randomId(), text: serverEvent.text }];

          case "chat":
            return [
              ...current,
              {
                kind: "chat",
                id: serverEvent.id,
                username: serverEvent.username,
                text: serverEvent.text,
                mine: serverEvent.username === usernameRef.current,
              },
            ];

          // agent_start / agent_chunk / agent_end mirror how streaming LLM
          // APIs work: a message begins, grows one delta at a time, then
          // closes - so the bubble is created once and only appended to.
          case "agent_start":
            return [...current, { kind: "agent", id: serverEvent.id, text: "", done: false }];

          case "agent_chunk":
            return current.map((bubble) =>
              bubble.kind === "agent" && bubble.id === serverEvent.id
                ? { ...bubble, text: bubble.text + serverEvent.text }
                : bubble,
            );

          case "agent_end":
            return current.map((bubble) =>
              bubble.kind === "agent" && bubble.id === serverEvent.id ? { ...bubble, done: true } : bubble,
            );
        }
      });
    });

    // Runs twice in dev under StrictMode (mount -> cleanup -> mount): the
    // first socket opens and is immediately closed, which is expected and
    // harmless here since `join` is only ever called from a user action.
    return () => {
      socket.close();
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      for (const timer of remoteTypingTimersRef.current.values()) clearTimeout(timer);
      remoteTypingTimersRef.current.clear();
    };
  }, []);

  const join = useCallback((username: string, room = "global") => {
    usernameRef.current = username;
    setCurrentRoom(room);
    socketRef.current?.send(JSON.stringify({ type: "join", username, room }));
  }, []);

  const switchRoom = useCallback((room: string) => {
    socketRef.current?.send(JSON.stringify({ type: "switch_room", room }));
  }, []);

  const createRoom = useCallback((name: string) => {
    setRoomError("");
    socketRef.current?.send(JSON.stringify({ type: "create_room", name }));
  }, []);

  const sendChat = useCallback((text: string) => {
    socketRef.current?.send(JSON.stringify({ type: "chat", text }));
  }, []);

  const setTyping = useCallback((isTyping: boolean) => {
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);

    const sendTyping = (value: boolean) => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "typing", isTyping: value }));
      }
    };

    if (!isTyping) {
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        sendTyping(false);
      }
      return;
    }

    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      sendTyping(true);
    }

    typingStopTimerRef.current = setTimeout(() => {
      typingActiveRef.current = false;
      sendTyping(false);
      typingStopTimerRef.current = null;
    }, TYPING_STOP_DELAY_MS);
  }, []);

  return {
    status,
    bubbles,
    onlineUsers,
    typingUsers,
    currentRoom,
    availableRooms,
    roomError,
    join,
    switchRoom,
    createRoom,
    sendChat,
    setTyping,
  };
}
