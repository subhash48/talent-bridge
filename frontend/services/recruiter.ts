import { apiFetch } from "@/services/api";
import type { Application, ApplicationStage, DashboardResponse } from "@/types/application";
import type { Candidate } from "@/types/candidate";

// Staff façade (ARCHITECTURE.md 8.2).
export function getDashboard(token: string) {
  return apiFetch<DashboardResponse>("/v1/dashboard", { token });
}

export function listCandidates(token: string, query = "") {
  const search = query ? `?q=${encodeURIComponent(query)}` : "";
  return apiFetch<Candidate[]>(`/v1/candidates${search}`, { token });
}

export function getApplication(token: string, applicationId: string) {
  return apiFetch<Application>(`/v1/applications/${applicationId}`, { token });
}

export function updateStage(token: string, applicationId: string, to: ApplicationStage) {
  return apiFetch<Application>(`/v1/applications/${applicationId}/stage`, {
    token,
    method: "PATCH",
    body: JSON.stringify({ to }),
  });
}
