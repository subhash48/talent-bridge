import { apiFetch } from "@/services/api";
import type { PortalInterview } from "@/types/interview";

// Candidate commands; each emits its event on the server (ARCHITECTURE.md 5.4, 8.3).
export function confirmInterview(token: string, interviewId: string, idempotencyKey = crypto.randomUUID()) {
  return apiFetch<PortalInterview>(`/v1/portal/interviews/${interviewId}/confirm`, {
    token,
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export function requestReschedule(token: string, interviewId: string, reason?: string) {
  return apiFetch<PortalInterview>(`/v1/portal/interviews/${interviewId}/reschedule-request`, {
    token,
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
