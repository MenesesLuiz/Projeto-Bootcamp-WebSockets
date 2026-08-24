import { z } from "zod";

/**
 * Wire protocol for the chat WebSocket. Every frame is a single JSON object
 * with a `type` field - client -> server messages are validated with zod
 * (never trust bytes coming off the wire); server -> client messages are
 * plain TS types, since this process is the one producing them.
 */

// ---- client -> server -------------------------------------------------

export const joinMessageSchema = z.object({
  type: z.literal("join"),
  username: z.string().trim().min(1, "Username is required").max(24, "Username is too long"),
});

export const chatMessageSchema = z.object({
  type: z.literal("chat"),
  text: z.string().trim().min(1, "Message text is required").max(500, "Message is too long"),
});

export const clientMessageSchema = z.discriminatedUnion("type", [joinMessageSchema, chatMessageSchema]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ParsedClientMessage =
  | { success: true; data: ClientMessage }
  | { success: false; error: string };

/** Parses and validates a raw WebSocket frame into a `ClientMessage`. */
export function parseClientMessage(raw: string): ParsedClientMessage {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { success: false, error: "Message is not valid JSON" };
  }

  const result = clientMessageSchema.safeParse(json);
  if (!result.success) {
    return { success: false, error: result.error.issues.map((issue) => issue.message).join(", ") };
  }

  return { success: true, data: result.data };
}

// ---- server -> client ---------------------------------------------------

export type SystemEvent = {
  type: "system";
  text: string;
};

export type ChatEvent = {
  type: "chat";
  id: string;
  username: string;
  text: string;
  createdAt: string;
};

/**
 * The agent's reply streams as three events - start, one or more chunks,
 * end - the same shape real LLM streaming APIs use (e.g. a message start,
 * a series of content deltas, a message stop). The client accumulates the
 * chunks under `id` into a single, growing bubble.
 */
export type AgentStartEvent = { type: "agent_start"; id: string };
export type AgentChunkEvent = { type: "agent_chunk"; id: string; text: string };
export type AgentEndEvent = { type: "agent_end"; id: string };

export type ServerEvent = SystemEvent | ChatEvent | AgentStartEvent | AgentChunkEvent | AgentEndEvent;
