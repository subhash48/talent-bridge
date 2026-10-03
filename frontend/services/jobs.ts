import { ApiError, USE_MOCK_API, apiFetch } from "@/services/api";
import { mockApi } from "@/services/mock/api";
import type { ApiJob } from "@/types/api";
import type { JobOpening } from "@/types/workspace";

// Jobs.

export async function getJobs(token?: string): Promise<JobOpening[]> {
  if (USE_MOCK_API) return mockApi.getJobs();
  return (await apiFetch<ApiJob[]>("/jobs", { token })).map(fromJob);
}

/** null when the job doesn't exist, including old links with ids that aren't UUIDs. */
export async function getJob(id: string, token?: string): Promise<JobOpening | null> {
  if (USE_MOCK_API) return mockApi.getJob(id);
  try {
    return fromJob(await apiFetch<ApiJob>(`/jobs/${encodeURIComponent(id)}`, { token }));
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) return null;
    throw error;
  }
}

function fromJob(job: ApiJob): JobOpening {
  return {
    id: job.id,
    title: job.title,
    department: job.department ?? "",
    location: job.location ?? "",
    employmentType: job.employment_type,
    status: job.status,
    hiringManager: job.hiring_manager ?? "Unassigned",
    openedAt: job.created_at,
    // The first paragraph; the rest of the description lists the requirements.
    summary: (job.description ?? "").split(/\n\s*\n/)[0] ?? "",
  };
}
