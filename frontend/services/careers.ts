import { answered } from "@/lib/demographics";
import { formatSalary } from "@/lib/format";
import { ApiError, USE_MOCK_API, apiFetch } from "@/services/api";
import type {
  ApiCareerApplicationCreate,
  ApiCareerApplicationResult,
  ApiCareerJobDetail,
  ApiCareerJobSummary,
  ApplyInput,
  ApplyResult,
  CareerJob,
  CareerJobDetail,
} from "@/types/careers";

// The public demo careers site (/demo/careers/*): development only, and no sign-in. Every demo route
// answers 404 while the demo is switched off (ENABLE_ASHBY_DEMO isn't set, or in production), and
// mock mode has no demo at all, so then there's nothing to list and the pages say the site is off.

/** Published demo jobs, newest first; null when the demo careers site is turned off. */
export async function listCareerJobs(): Promise<CareerJob[] | null> {
  if (USE_MOCK_API) return null;
  try {
    return (await apiFetch<ApiCareerJobSummary[]>("/demo/careers/jobs")).map(fromSummary);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** One published demo job; null when it isn't on the careers site (a draft, closed, unknown, not a UUID) or the site is off. */
export async function getCareerJob(id: string): Promise<CareerJobDetail | null> {
  if (USE_MOCK_API) return null;
  try {
    return fromDetail(await apiFetch<ApiCareerJobDetail>(`/demo/careers/jobs/${encodeURIComponent(id)}`));
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) return null;
    throw error;
  }
}

/**
 * POST /demo/careers/jobs/{id}/apply. The API keeps the application pending, with the résumé, until
 * the applicant activates their candidate portal account or signs in; the result says which to do.
 */
export async function applyToJob(id: string, input: ApplyInput): Promise<ApplyResult> {
  if (USE_MOCK_API) throw new ApiError("The demo careers site is turned off.", 404, "not_found");
  const body: ApiCareerApplicationCreate = {
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone: input.phone,
    linkedin_url: input.linkedinUrl,
    resume: { file_name: input.resume.fileName, content_type: input.resume.contentType, data: input.resume.data },
    demographics: answered(input.demographics),
  };
  const result = await apiFetch<ApiCareerApplicationResult>(`/demo/careers/jobs/${encodeURIComponent(id)}/apply`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { status: result.status, email: result.email, jobTitle: result.job_title };
}

function fromSummary(job: ApiCareerJobSummary): CareerJob {
  return {
    id: job.id,
    title: job.title,
    department: job.department,
    location: job.location,
    workArrangement: job.work_arrangement,
    employmentType: job.employment_type,
    seniority: job.seniority,
    salary: formatSalary(job.salary_min, job.salary_max, job.salary_currency),
    summary: job.summary,
    publishedAt: job.published_at,
  };
}

function fromDetail(job: ApiCareerJobDetail): CareerJobDetail {
  return {
    ...fromSummary(job),
    aboutRole: job.about_role,
    responsibilities: job.responsibilities,
    requirements: job.requirements,
    preferredQualifications: job.preferred_qualifications,
    skills: job.skills,
    aboutTeam: job.about_team,
  };
}
