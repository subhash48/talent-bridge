import { ApiError, USE_MOCK_API, apiFetch } from "@/services/api";
import { mockApi } from "@/services/mock/api";
import type { ApiJob } from "@/types/api";
import type { JobOpening } from "@/types/workspace";

// Jobs.

export async function getJobs(): Promise<JobOpening[]> {
  if (USE_MOCK_API) return mockApi.getJobs();
  return (await apiFetch<ApiJob[]>("/jobs")).map(fromJob);
}

/** null when the job doesn't exist, including old links with ids that aren't UUIDs. */
export async function getJob(id: string): Promise<JobOpening | null> {
  if (USE_MOCK_API) return mockApi.getJob(id);
  try {
    return fromJob(await apiFetch<ApiJob>(`/jobs/${encodeURIComponent(id)}`));
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) return null;
    throw error;
  }
}

export type NewJobInput = { title: string; department: string; location: string; employmentType: string; description: string };

/** POST /jobs: open straight away, so it's on the careers site. */
export async function createJob(input: NewJobInput): Promise<JobOpening> {
  if (USE_MOCK_API) return mockApi.createJob(input);
  const job = await apiFetch<ApiJob>("/jobs", {
    method: "POST",
    body: JSON.stringify({
      title: input.title.trim(),
      department: input.department.trim() || null,
      location: input.location.trim() || null,
      employment_type: input.employmentType,
      description: input.description.trim() || null,
      status: "open",
    }),
  });
  return fromJob(job);
}

/** PATCH /jobs/{id}: close a role (it leaves the careers site; its candidates stay) or reopen it. */
export async function setJobStatus(id: string, status: JobOpening["status"]): Promise<JobOpening> {
  if (USE_MOCK_API) return mockApi.setJobStatus(id, status);
  return fromJob(await apiFetch<ApiJob>(`/jobs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }));
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
    pay: job.pay ?? null,
    shift: job.shift ?? null,
    workDays: job.work_days ?? [],
    openings: job.openings ?? null,
  };
}
