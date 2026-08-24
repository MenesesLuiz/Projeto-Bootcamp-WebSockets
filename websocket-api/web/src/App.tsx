import { useEffect, useRef, useState, type FormEvent } from "react";
import { useChatSocket } from "./useChatSocket";
import type { Bubble, ConnectionStatus } from "./types";

function App() {
  const { status, bubbles, join, sendChat } = useChatSocket();
  const [username, setUsername] = useState("");
  const [hasJoined, setHasJoined] = useState(false);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles]);

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;
    join(trimmed);
    setHasJoined(true);
  }

  function handleSend(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    sendChat(trimmed);
    setDraft("");
  }

  if (!hasJoined) {
    return (
      <main className="container join-screen">
        <h1>Realtime Chat</h1>
        <p className="hint">Workshop de streaming &amp; WebSockets - tudo rodando em localhost</p>
        <form onSubmit={handleJoin} className="join-form">
          <input
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

      <p className="mention-hint">
        Marque <strong>@agente</strong> na mensagem para receber uma resposta em streaming.
      </p>

      <form onSubmit={handleSend} className="message-form">
        <input
          type="text"
          placeholder="Escreva uma mensagem... (ex: @agente, tudo bem?)"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          disabled={status !== "open"}
          autoFocus
        />
        <button type="submit" disabled={status !== "open" || !draft.trim()}>
          Enviar
        </button>
      </form>
    </main>
  );
}

function statusLabel(status: ConnectionStatus): string {
  if (status === "open") return "conectado";
  if (status === "connecting") return "conectando...";
  return "desconectado";
}

function bubbleClassName(bubble: Bubble): string {
  if (bubble.kind === "system") return "message system";
  if (bubble.kind === "agent") return "message agent";
  return bubble.mine ? "message mine" : "message theirs";
}

export default App;
