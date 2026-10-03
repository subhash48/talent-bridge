export type ChatInput = {
  message: string;
  conversation_id?: string;
  focus?: { application_id: string };
};

export type ChatSource = { type: string; id: string; label: string };

// Server-Sent Events from POST /v1/ai/chat (ARCHITECTURE.md 6.9).
export type ChatStreamEvent =
  | { event: "meta"; data: { conversation_id: string; message_id: string; sources: ChatSource[] } }
  | { event: "delta"; data: { text: string } }
  | { event: "action"; data: { type: "handoff"; label: string; prefill: string } }
  | { event: "done"; data: { stop_reason: string; usage: Record<string, number> } }
  | { event: "error"; data: { code: string; fallback?: string } };

// fetch + ReadableStream, because EventSource can't send a Bearer header.
export async function* streamChat(token: string, input: ChatInput): AsyncGenerator<ChatStreamEvent> {
  throw new Error("Not implemented");
}
