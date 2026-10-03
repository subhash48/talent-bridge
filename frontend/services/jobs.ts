import { USE_MOCK_API, apiFetch } from "@/services/api";
import { mockApi } from "@/services/mock/api";
import type { JobOpening } from "@/types/workspace";

// Staff façade: jobs (ARCHITECTURE.md 8.2).

export function getJobs(token?: string): Promise<JobOpening[]> {
  if (USE_MOCK_API) return mockApi.getJobs();
  return apiFetch<JobOpening[]>("/v1/jobs", { token });
}

export function getJob(id: string, token?: string): Promise<JobOpening | null> {
  if (USE_MOCK_API) return mockApi.getJob(id);
  return apiFetch<JobOpening>(`/v1/jobs/${id}`, { token });
}
