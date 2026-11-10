import { ApiError, USE_MOCK_API, apiFetch } from "@/services/api";
import { mockApi } from "@/services/mock/api";
import type { ApiJob } from "@/types/api";
import type { ApiJobBoardFields, ApiJobBoardInput, JobBoardSettings, ManagedJob } from "@/types/job";
import type { JobOpening } from "@/types/workspace";

// Jobs.

/** JobRead: the workspace fields plus the job board ones. */
type ApiJobRead = ApiJob & ApiJobBoardFields;

export async function getJobs(): Promise<ManagedJob[]> {
  if (USE_MOCK_API) return mockApi.getJobs();
  return (await apiFetch<ApiJobRead[]>("/jobs")).map(fromJob);
}

/** null when the job doesn't exist, including old links with ids that aren't UUIDs. */
export async function getJob(id: string): Promise<ManagedJob | null> {
  if (USE_MOCK_API) return mockApi.getJob(id);
  try {
    return fromJob(await apiFetch<ApiJobRead>(`/jobs/${encodeURIComponent(id)}`));
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) return null;
    throw error;
  }
}

/** What the job form sends. Strings are as typed; salary figures are whole numbers or null. */
export type NewJobInput = {
  title: string;
  department: string;
  location: string;
  employmentType: string;
  description: string;
} & Omit<JobBoardSettings, "salaryCurrency" | "salaryPeriod"> & {
    /** Used only when a salary figure is given. */
    salaryCurrency: string;
    salaryPeriod: NonNullable<JobBoardSettings["salaryPeriod"]>;
  };

/** POST /jobs: open straight away, so a public one is on the Hirvello job board. */
export async function createJob(input: NewJobInput): Promise<ManagedJob> {
  if (USE_MOCK_API) return mockApi.createJob(input);
  const job = await apiFetch<ApiJobRead>("/jobs", { method: "POST", body: JSON.stringify({ ...jobBody(input), status: "open" }) });
  return fromJob(job);
}

/** PATCH /jobs/{id} with every field the form shows; the status stays as it is. */
export async function updateJob(id: string, input: NewJobInput): Promise<ManagedJob> {
  if (USE_MOCK_API) return mockApi.updateJob(id, input);
  return fromJob(await apiFetch<ApiJobRead>(`/jobs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(jobBody(input)) }));
}

/**
 * PATCH /jobs/{id}: close a role (it leaves the job board; its candidates stay) or reopen it. Reopening a role
 * whose closing date has passed clears that date too, or it would be open but still not taking applications.
 */
export async function setJobStatus(
  id: string,
  status: JobOpening["status"],
  { clearClosingDate = false }: { clearClosingDate?: boolean } = {},
): Promise<ManagedJob> {
  if (USE_MOCK_API) return mockApi.setJobStatus(id, status, { clearClosingDate });
  const body = clearClosingDate ? { status, expires_at: null } : { status };
  return fromJob(await apiFetch<ApiJobRead>(`/jobs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }));
}

/** True once the job's "Applications close on" moment is behind us. */
export function closingDatePassed(job: Pick<JobBoardSettings, "expiresAt">, now = Date.now()): boolean {
  return job.expiresAt !== null && new Date(job.expiresAt).getTime() <= now;
}

/** The job's public page on the Hirvello job board, or null while it isn't there (the API's public rule). */
export function jobBoardHref(job: ManagedJob, now = Date.now()): string | null {
  const listed = job.status === "open" && !job.external && job.visibility === "public" && !closingDatePassed(job, now);
  return listed ? `/jobs/${encodeURIComponent(job.id)}` : null;
}

function jobBody(input: NewJobInput): ApiJobBoardInput & Record<string, unknown> {
  // Currency and period only mean something next to a figure; without one they're cleared.
  const salary = input.salaryMin !== null || input.salaryMax !== null;
  return {
    title: input.title.trim(),
    department: input.department.trim() || null,
    location: input.location.trim() || null,
    employment_type: input.employmentType,
    description: input.description.trim() || null,
    work_arrangement: input.workArrangement,
    salary_min: input.salaryMin,
    salary_max: input.salaryMax,
    salary_currency: salary ? input.salaryCurrency : null,
    salary_period: salary ? input.salaryPeriod : null,
    expires_at: input.expiresAt,
    visibility: input.visibility,
  };
}

function fromJob(job: ApiJobRead): ManagedJob {
  return {
    id: job.id,
    title: job.title,
    department: job.department ?? "",
    location: job.location ?? "",
    employmentType: job.employment_type,
    status: job.status,
    hiringManager: job.hiring_manager ?? "Unassigned",
    openedAt: job.created_at,
    description: job.description ?? "",
    // The first paragraph; the rest of the description lists the requirements.
    summary: (job.description ?? "").split(/\n\s*\n/)[0] ?? "",
    pay: job.pay ?? null,
    shift: job.shift ?? null,
    workDays: job.work_days ?? [],
    openings: job.openings ?? null,
    external: job.external_id !== null,
    workArrangement: job.work_arrangement,
    salaryMin: job.salary_min,
    salaryMax: job.salary_max,
    salaryCurrency: job.salary_currency,
    salaryPeriod: job.salary_period,
    expiresAt: job.expires_at,
    visibility: job.visibility,
    postedBy: job.posted_by,
    publishedAt: job.published_at,
  };
}
