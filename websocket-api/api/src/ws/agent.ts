import { randomUUID } from "crypto";
import type { ConnectionRegistry } from "./connection-registry";
import { sleep } from "../utils/sleep";

const CHUNK_DELAY_MS = 90;
const AGENT_MENTION = "@agente";

const PAYMENT_KEYWORDS = ["pagamento", "pix", "cobranca", "cobrança"];
const GREETING_KEYWORDS = ["oi", "ola", "olá", "hey", "eae"];

/**
 * The agent only replies when explicitly mentioned - otherwise every human
 * message in the room would also trigger a reply, which gets noisy fast in
 * a chat with more than two people.
 */
export function mentionsAgent(text: string): boolean {
  return text.toLowerCase().includes(AGENT_MENTION);
}

/**
 * Picks a canned reply based on simple keyword matching. This is a stand-in
 * for a real model call - swap this for a request to an LLM (e.g. the
 * Claude API) to go from simulated to real streaming. The rest of the flow
 * (start/chunk/end below) already matches how token streaming works.
 */
function pickReply(incomingText: string): string {
  const normalized = incomingText.toLowerCase();

  if (PAYMENT_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "Analisando o pagamento... verificando com o adquirente... status: aprovado.";
  }

  if (GREETING_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "Olá! Sou o agente de demonstração deste workshop. Cada palavra que você está lendo chegou num frame separado, pelo mesmo canal WebSocket.";
  }

  return "Recebi sua mensagem! Repare que esta resposta está chegando aos poucos, em pedaços - é assim que uma API de IA de verdade transmite o que gera.";
}

/** Splits a reply into word-sized chunks, each keeping its leading space so the client can just concatenate them in order. */
function toChunks(reply: string): string[] {
  return reply.split(" ").map((word, index) => (index === 0 ? word : ` ${word}`));
}

/**
 * Streams a simulated agent reply to everyone connected: an `agent_start`
 * event opens a new bubble, one `agent_chunk` per word grows it, and
 * `agent_end` closes it. Broadcasting (not just replying to the sender)
 * keeps every open tab in sync, same as a human chat message.
 */
export async function streamAgentReply(registry: ConnectionRegistry, incomingText: string): Promise<void> {
  const id = randomUUID();
  const chunks = toChunks(pickReply(incomingText));

  registry.broadcast({ type: "agent_start", id });

  for (const chunk of chunks) {
    await sleep(CHUNK_DELAY_MS);
    registry.broadcast({ type: "agent_chunk", id, text: chunk });
  }

  registry.broadcast({ type: "agent_end", id });
}
