import { USE_MOCK_API, apiFetch } from "@/services/api";
import { mockApi } from "@/services/mock/api";
import type { ScheduledInterview } from "@/types/workspace";

// Staff façade: interview schedule (ARCHITECTURE.md 8.2).
export function getInterviews(token?: string): Promise<ScheduledInterview[]> {
  if (USE_MOCK_API) return mockApi.getInterviews();
  return apiFetch<ScheduledInterview[]>("/v1/interviews", { token });
}
