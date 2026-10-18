import { USE_MOCK_API, apiFetch } from "@/services/api";
import { mockDraftMessage } from "@/services/mock/ai";
import type { ApiDraft, ApiDraftPurpose } from "@/types/api";

// Recruiter AI. The browser sends only the application id; the server builds the context and holds
// every model key. The AI drafts messages for the recruiter to edit; it never evaluates, sends or decides.

export type MessageDraft = { subject: string; body: string };

/** POST /ai/draft-message. A draft for the recruiter to edit; nothing is sent. */
export async function draftMessage(
  candidateId: string,
  purpose: ApiDraftPurpose = "follow_up",
  signal?: AbortSignal,
): Promise<MessageDraft> {
  if (USE_MOCK_API) return mockDraftMessage(candidateId, signal);
  const { subject, body } = await apiFetch<ApiDraft>("/ai/draft-message", {
    method: "POST",
    body: JSON.stringify({ application_id: candidateId, purpose }),
    signal,
  });
  return { subject, body };
}
