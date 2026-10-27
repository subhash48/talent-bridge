import { ApiError, USE_MOCK_API, apiFetch } from "@/services/api";
import type {
  AssistantContext,
  AssistantHistoryItem,
  AssistantResponse,
  AssistantStatus,
  ConfirmEdits,
  InputType,
  OutreachRequest,
} from "@/types/assistant";

// The recruiter assistant (/assistant/*). Typed and spoken requests go through the same call; speech is
// transcribed first (by the API, or by the browser where the API has no transcription) and only the
// words are sent on. The server checks the recruiter's role on every call.

const NEEDS_API = new ApiError("The AI Assistant needs the Kavuntra API. Turn off mock mode to use it.", 0, "mock_mode");

export type AssistantRequest = {
  text: string;
  inputType: InputType;
  context: AssistantContext;
  /** Random per request: sending the same one twice (a double click, a retry) runs it once. */
  clientRequestId: string;
  /** What the recruiter changed on the card of the proposal in context, so "yes" approves what they see. */
  edits?: ConfirmEdits;
  signal?: AbortSignal;
};

export async function askAssistant({ text, inputType, context, clientRequestId, edits, signal }: AssistantRequest): Promise<AssistantResponse> {
  if (USE_MOCK_API) throw NEEDS_API;
  return apiFetch<AssistantResponse>("/assistant/requests", {
    method: "POST",
    body: JSON.stringify({
      text,
      input_type: inputType,
      context,
      client_request_id: clientRequestId,
      utc_offset_minutes: -new Date().getTimezoneOffset(),
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(edits ? { edits } : {}),
    }),
    signal,
  });
}

/** Run a proposal with the recruiter's edits: send the message or the outreach, create the job. Once only. */
export async function confirmAction(actionId: string, edits: ConfirmEdits = {}): Promise<AssistantResponse> {
  if (USE_MOCK_API) throw NEEDS_API;
  return apiFetch<AssistantResponse>(`/assistant/actions/${actionId}/confirm`, {
    method: "POST",
    body: JSON.stringify(edits),
  });
}

/**
 * POST /assistant/outreach: one personal draft per candidate ticked on the Candidates page, with interview
 * times when a schedule is given. The same proposal the assistant makes; nothing is sent until it's approved.
 */
export async function draftOutreach(request: OutreachRequest): Promise<AssistantResponse> {
  if (USE_MOCK_API) throw NEEDS_API;
  return apiFetch<AssistantResponse>("/assistant/outreach", {
    method: "POST",
    body: JSON.stringify({
      ...request,
      client_request_id: crypto.randomUUID(),
      utc_offset_minutes: -new Date().getTimezoneOffset(),
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
}

export async function cancelAction(actionId: string): Promise<void> {
  if (USE_MOCK_API) throw NEEDS_API;
  await apiFetch<void>(`/assistant/actions/${actionId}/cancel`, { method: "POST" });
}

export async function getRecentActions(): Promise<AssistantHistoryItem[]> {
  if (USE_MOCK_API) return [];
  return apiFetch<AssistantHistoryItem[]>("/assistant/actions?limit=20");
}

export async function getAssistantStatus(): Promise<AssistantStatus | null> {
  if (USE_MOCK_API) return null;
  return apiFetch<AssistantStatus>("/assistant/status");
}

/** POST /assistant/transcribe: the recording in, the words out. Nothing is kept. */
export async function transcribe(audio: Blob, signal?: AbortSignal): Promise<string> {
  if (USE_MOCK_API) throw NEEDS_API;
  const { text } = await apiFetch<{ text: string }>("/assistant/transcribe", {
    method: "POST",
    body: audio,
    headers: { "Content-Type": audio.type || "audio/webm" },
    signal,
  });
  return text;
}
