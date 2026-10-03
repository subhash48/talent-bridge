import { ApiError, USE_MOCK_API, apiFetch, errorMessage } from "@/services/api";
import { fromAnalysis } from "@/services/candidates";
import { mockCandidateChat } from "@/services/mock/ai";
import type { ApiAnalysis, ApiAskResponse, ApiDraft, ApiDraftPurpose } from "@/types/api";
import type { CandidateAnalysis } from "@/types/workspace";

// Recruiter AI. The browser sends only the application id and the question; the server builds the
// context and holds every model key. The AI analyses and drafts; it never sends or decides.

export type ChatSource = { type: string; id: string; label: string };

// The events the AI panel renders. Answers arrive whole from the API and stream in mock mode.
export type ChatStreamEvent =
  | { event: "meta"; data: { conversation_id: string; message_id: string; sources: ChatSource[] } }
  | { event: "delta"; data: { text: string } }
  | { event: "action"; data: { type: "handoff"; label: string; prefill: string } }
  | { event: "done"; data: { stop_reason: string; usage: Record<string, number> } }
  | { event: "error"; data: { code: string; fallback?: string } };

export type AskCandidateAIInput = {
  candidateId: string;
  message: string;
  token?: string;
  signal?: AbortSignal;
};

/** POST /ai/ask-candidate about one application (candidateId is the application id). */
export async function* askCandidateAI({ candidateId, message, token, signal }: AskCandidateAIInput): AsyncGenerator<ChatStreamEvent> {
  if (USE_MOCK_API) {
    yield* mockCandidateChat(candidateId, message, signal);
    return;
  }
  let response: ApiAskResponse;
  try {
    response = await apiFetch<ApiAskResponse>("/ai/ask-candidate", {
      token,
      method: "POST",
      body: JSON.stringify({ application_id: candidateId, message }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    const code = error instanceof ApiError ? error.code : "error";
    yield { event: "error", data: { code, fallback: errorMessage(error, "I couldn't reach the AI service. Try again in a moment.") } };
    return;
  }
  yield { event: "meta", data: { conversation_id: "", message_id: "", sources: response.sources } };
  yield { event: "delta", data: { text: response.answer } };
  yield { event: "done", data: { stop_reason: "end", usage: {} } };
}

export type MessageDraft = { subject: string; body: string };

/** POST /ai/draft-message. A draft for the recruiter to edit; nothing is sent. */
export async function draftMessage(
  candidateId: string,
  purpose: ApiDraftPurpose = "follow_up",
  signal?: AbortSignal,
  token?: string,
): Promise<MessageDraft> {
  if (USE_MOCK_API) return mockDraft(candidateId, signal);
  const { subject, body } = await apiFetch<ApiDraft>("/ai/draft-message", {
    token,
    method: "POST",
    body: JSON.stringify({ application_id: candidateId, purpose }),
    signal,
  });
  return { subject, body };
}

/** POST /ai/analyze-candidate: evidence, gaps and questions for the recruiter to review. */
export async function analyzeCandidate(candidateId: string, token?: string): Promise<CandidateAnalysis> {
  if (USE_MOCK_API) {
    throw new ApiError("AI analysis needs the Talent Bridge API. Turn off mock mode to use it.", 0, "mock_mode");
  }
  const analysis = await apiFetch<ApiAnalysis>("/ai/analyze-candidate", {
    token,
    method: "POST",
    body: JSON.stringify({ application_id: candidateId }),
  });
  return fromAnalysis(analysis);
}

async function mockDraft(candidateId: string, signal?: AbortSignal): Promise<MessageDraft> {
  let text = "";
  for await (const event of mockCandidateChat(candidateId, "Draft a follow-up message", signal)) {
    if (event.event === "delta") text += event.data.text;
  }
  const subject = /\*\*Subject:\*\*\s*(.+)/.exec(text)?.[1]?.trim() ?? "";
  const start = text.indexOf("Hi ");
  return { subject, body: start === -1 ? text : text.slice(start).replace(/\*\*/g, "") };
}
