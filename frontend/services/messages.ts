import { USE_MOCK_API, apiFetch } from "@/services/api";
import { mockApi } from "@/services/mock/api";
import type { Conversation, ThreadMessage } from "@/types/workspace";

// Staff façade: application threads (ARCHITECTURE.md 8.2). Recruiters send; the AI only drafts.

export function getConversations(token?: string): Promise<Conversation[]> {
  if (USE_MOCK_API) return mockApi.getConversations();
  return apiFetch<Conversation[]>("/v1/messages", { token });
}

export function getUnreadThreadCount(token?: string): Promise<number> {
  if (USE_MOCK_API) return mockApi.getUnreadThreadCount();
  return apiFetch<{ count: number }>("/v1/messages/unread-count", { token }).then(({ count }) => count);
}

export function sendMessage(candidateId: string, body: string, token?: string): Promise<ThreadMessage> {
  if (USE_MOCK_API) return mockApi.sendMessage(candidateId, body);
  return apiFetch<ThreadMessage>(`/v1/applications/${candidateId}/messages`, {
    token,
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ body }),
  });
}

export function markConversationRead(candidateId: string, token?: string): Promise<void> {
  if (USE_MOCK_API) return mockApi.markConversationRead(candidateId);
  return apiFetch<void>(`/v1/applications/${candidateId}/messages/read`, { token, method: "POST" });
}
