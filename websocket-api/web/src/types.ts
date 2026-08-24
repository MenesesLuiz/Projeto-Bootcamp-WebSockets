/** Mirrors the server's wire protocol (api/src/ws/protocol.ts). */
export type ServerEvent =
  | { type: "system"; text: string }
  | { type: "chat"; id: string; username: string; text: string; createdAt: string }
  | { type: "agent_start"; id: string }
  | { type: "agent_chunk"; id: string; text: string }
  | { type: "agent_end"; id: string };

/** UI-facing shape the chat list renders - one entry per line in the transcript. */
export type Bubble =
  | { kind: "system"; id: string; text: string }
  | { kind: "chat"; id: string; username: string; text: string; mine: boolean }
  | { kind: "agent"; id: string; text: string; done: boolean };

export type ConnectionStatus = "connecting" | "open" | "closed";
