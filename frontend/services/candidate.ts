import { apiFetch } from "@/services/api";
import type { PortalApplication } from "@/types/application";
import type { PortalHome } from "@/types/candidate";

// Portal façade (ARCHITECTURE.md 8.3).
export function getPortalHome(token: string) {
  return apiFetch<PortalHome>("/v1/portal/home", { token });
}

export function getPortalApplication(token: string, applicationId: string) {
  return apiFetch<PortalApplication>(`/v1/portal/applications/${applicationId}`, { token });
}
