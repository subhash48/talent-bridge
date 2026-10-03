import { apiFetch } from "@/services/api";
import type { PortalApplication } from "@/types/application";
import type { PortalHome } from "@/types/candidate";
import type { PortalInterview } from "@/types/interview";

// Portal façade for the Candidate Portal (ARCHITECTURE.md 8.3).
export function getPortalHome(token: string) {
  return apiFetch<PortalHome>("/portal/home", { token });
}

export function getPortalApplication(token: string, applicationId: string) {
  return apiFetch<PortalApplication>(`/portal/applications/${applicationId}`, { token });
}

// Candidate commands; each emits its event on the server (ARCHITECTURE.md 5.4, 8.3).
export function confirmInterview(token: string, interviewId: string, idempotencyKey = crypto.randomUUID()) {
  return apiFetch<PortalInterview>(`/portal/interviews/${interviewId}/confirm`, {
    token,
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export function requestReschedule(token: string, interviewId: string, reason?: string) {
  return apiFetch<PortalInterview>(`/portal/interviews/${interviewId}/reschedule-request`, {
    token,
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
