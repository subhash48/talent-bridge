import { USE_MOCK_API, apiFetch } from "@/services/api";
import { mockApi } from "@/services/mock/api";
import type { ApiConversation, ApiMessage } from "@/types/api";
import type { Conversation, ThreadMessage } from "@/types/workspace";

// Application threads. Recruiters send; the AI only drafts.

export async function getConversations(token?: string): Promise<Conversation[]> {
  if (USE_MOCK_API) return mockApi.getConversations();
  const conversations = await apiFetch<ApiConversation[]>("/messages/conversations", { token });
  return conversations.map(({ candidate, unread, messages }) => ({
    candidate: {
      id: candidate.application_id,
      name: candidate.full_name,
      role: candidate.job_title,
      avatarUrl: candidate.avatar_url ?? undefined,
    },
    unread,
    messages: messages.map(fromMessage),
  }));
}

export async function getUnreadThreadCount(token?: string): Promise<number> {
  if (USE_MOCK_API) return mockApi.getUnreadThreadCount();
  const { count } = await apiFetch<{ count: number }>("/messages/unread-count", { token });
  return count;
}

export async function sendMessage(candidateId: string, body: string, token?: string): Promise<ThreadMessage> {
  if (USE_MOCK_API) return mockApi.sendMessage(candidateId, body);
  const message = await apiFetch<ApiMessage>(`/applications/${candidateId}/messages`, {
    token,
    method: "POST",
    body: JSON.stringify({ content: body }),
  });
  return fromMessage(message);
}

export async function markConversationRead(candidateId: string, token?: string): Promise<void> {
  if (USE_MOCK_API) return mockApi.markConversationRead(candidateId);
  await apiFetch<void>(`/applications/${candidateId}/messages/read`, { token, method: "POST" });
}

export function fromMessage(message: ApiMessage): ThreadMessage {
  return {
    id: message.id,
    author: message.sender_type === "candidate" ? "candidate" : "recruiter",
    body: message.content,
    sentAt: message.created_at,
  };
}
