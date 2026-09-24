import { useEffect, useRef, useState, type FormEvent } from "react";
import { useChatSocket } from "./useChatSocket";
import type { Bubble, ConnectionStatus } from "./types";

const DEFAULT_ROOM = "global";

function App() {
  const {
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
    renameRoom,
    sendChat,
    setTyping,
  } = useChatSocket();
  const [username, setUsername] = useState("");
  const [hasJoined, setHasJoined] = useState(false);
  const [draft, setDraft] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [renameRoomName, setRenameRoomName] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles]);

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;
    join(trimmed, DEFAULT_ROOM);
    setHasJoined(true);
  }

  function handleSend(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    sendChat(trimmed);
    setTyping(false);
    setDraft("");
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    setTyping(value.trim().length > 0);
  }

  function handleSwitchRoom(room: string) {
    if (room === currentRoom) return;
    setTyping(false);
    switchRoom(room);
  }

  function handleCreateRoom(event: FormEvent) {
    event.preventDefault();
    const trimmed = newRoomName.trim();
    if (!trimmed) return;
    createRoom(trimmed);
    setNewRoomName("");
  }

  function handleRenameRoom(event: FormEvent) {
    event.preventDefault();
    const trimmed = renameRoomName.trim();
    if (!trimmed || currentRoom === DEFAULT_ROOM) return;
    renameRoom(trimmed);
    setRenameRoomName("");
  }

  if (!hasJoined) {
    return (
      <main className="container join-screen">
        <h1>Realtime Chat</h1>
        <p className="hint">Workshop de streaming &amp; WebSockets - tudo rodando em localhost</p>
        <form onSubmit={handleJoin} className="join-form">
          <label htmlFor="username">Nome</label>
          <input
            id="username"
            type="text"
            placeholder="Seu nome"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            maxLength={24}
            autoFocus
            required
          />
          <button type="submit" disabled={status !== "open"}>
            {status === "open" ? "Entrar no chat" : "Conectando..."}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="container chat-screen">
      <aside className="online-sidebar" aria-label="Usuários online">
        <div className="online-sidebar-header">
          <h2>Online</h2>
          <span>{onlineUsers.length}</span>
        </div>
        <ul className="online-user-list">
          {onlineUsers.map((user, index) => (
            <li key={`${user}-${index}`} className="online-user-card">
              <span className="online-dot" aria-hidden="true" />
              {user}
            </li>
          ))}
        </ul>

        <div className="sidebar-section">
          <div className="online-sidebar-header">
            <h2>Salas disponíveis</h2>
          </div>
          <ul className="room-list">
            {availableRooms.map((room) => (
              <li key={room}>
                <button
                  type="button"
                  className={`room-card ${room === currentRoom ? "current-room" : ""}`}
                  onClick={() => handleSwitchRoom(room)}
                  disabled={room === currentRoom}
                >
                  <span>#{room}</span>
                  {room === currentRoom && <small>atual</small>}
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={handleCreateRoom} className="room-create-form">
            <input
              type="text"
              placeholder="Nome da nova sala"
              value={newRoomName}
              onChange={(event) => setNewRoomName(event.target.value)}
              maxLength={24}
              aria-label="Nome da nova sala"
            />
            <button type="submit" disabled={status !== "open" || !newRoomName.trim()}>
              Criar sala
            </button>
          </form>
          {currentRoom !== DEFAULT_ROOM && (
            <form onSubmit={handleRenameRoom} className="room-rename-form">
              <input
                type="text"
                placeholder="Novo nome da sala"
                value={renameRoomName}
                onChange={(event) => setRenameRoomName(event.target.value)}
                maxLength={24}
                aria-label="Novo nome da sala"
              />
              <button type="submit" disabled={status !== "open" || !renameRoomName.trim()}>
                Renomear sala
              </button>
            </form>
          )}
          {roomError && <p className="room-error">{roomError}</p>}
        </div>
      </aside>

      <section className="chat-content">
      <header className="chat-header">
        <h1>Realtime Chat</h1>
        <span className={`status status-${status}`}>{statusLabel(status)}</span>
      </header>

      <ul className="message-list" ref={listRef}>
        {bubbles.map((bubble) => (
          <li key={bubble.id} className={bubbleClassName(bubble)}>
            {bubble.kind === "system" && <span className="system-text">{bubble.text}</span>}

            {bubble.kind === "chat" && (
              <>
                {!bubble.mine && <span className="bubble-author">{bubble.username}</span>}
                <p className="bubble-text">{bubble.text}</p>
              </>
            )}

            {bubble.kind === "agent" && (
              <>
                <span className="bubble-author">agente</span>
                <p className="bubble-text">
                  {bubble.text}
                  {!bubble.done && <span className="cursor">▍</span>}
                </p>
              </>
            )}
          </li>
        ))}
      </ul>

      {typingUsers.length > 0 && <p className="typing-indicator">{typingLabel(typingUsers)}</p>}

      <p className="mention-hint">
        Marque <strong>@agente</strong> na mensagem para receber uma resposta em streaming.
      </p>

      <form onSubmit={handleSend} className="message-form">
        <label htmlFor="message">Mensagem</label>
        <input
          id="message"
          type="text"
          placeholder="Escreva uma mensagem... (ex: @agente, tudo bem?)"
          value={draft}
          onChange={(event) => handleDraftChange(event.target.value)}
          maxLength={500}
          disabled={status !== "open"}
        />
        <button type="submit" disabled={status !== "open" || !draft.trim()}>
          Enviar
        </button>
      </form>
      </section>
    </main>
  );
}

function statusLabel(status: ConnectionStatus): string {
  if (status === "open") return "conectado";
  if (status === "reconnecting") return "reconectando...";
  if (status === "connecting") return "conectando...";
  return "desconectado";
}

function typingLabel(usernames: string[]): string {
  if (usernames.length === 1) return `${usernames[0]} está digitando...`;
  if (usernames.length === 2) return `${usernames.join(" e ")} estão digitando...`;
  return `${usernames[0]} e mais ${usernames.length - 1} estão digitando...`;
}

function bubbleClassName(bubble: Bubble): string {
  if (bubble.kind === "system") return "message system";
  if (bubble.kind === "agent") return "message agent";
  return bubble.mine ? "message mine" : "message theirs";
}

export default App;
