import { API_URL, USE_MOCK_API } from "@/services/api";
import { mockCandidateChat } from "@/services/mock/ai";

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
export async function* streamChat(
  token: string | undefined,
  input: ChatInput,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const headers = new Headers({ "Content-Type": "application/json", Accept: "text/event-stream" });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}/v1/ai/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`AI chat failed with ${response.status}`);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value.replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const event = parseFrame(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      if (event) yield event;
      boundary = buffer.indexOf("\n\n");
    }
  }
}

function parseFrame(frame: string): ChatStreamEvent | null {
  let name = "message";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  return { event: name, data: JSON.parse(data.join("\n")) } as ChatStreamEvent;
}

export type AskCandidateAIInput = {
  candidateId: string;
  message: string;
  token?: string;
  signal?: AbortSignal;
};

/**
 * Ask the Recruiter Copilot about one candidate. The server builds the context from the
 * application id, so the browser only sends the question; no API keys live in the frontend.
 */
export async function* askCandidateAI({ candidateId, message, token, signal }: AskCandidateAIInput) {
  if (USE_MOCK_API) {
    yield* mockCandidateChat(candidateId, message, signal);
    return;
  }
  yield* streamChat(token, { message, focus: { application_id: candidateId } }, signal);
}
