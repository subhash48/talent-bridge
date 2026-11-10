import { apiSearchParams, formatPayRange, type BoardQuery } from "@/components/jobs/board";
import { ApiError, USE_MOCK_API, apiFetch } from "@/services/api";
import type {
  ApiCandidateApplicationCreate,
  ApiCandidateApplyResult,
  ApiCareerApplicationCreate,
  ApiCareerApplicationResult,
  ApiCareerJobDetail,
  ApiCareerJobSummary,
  ApiJobBoardPage,
  ApiNativeApplicationResult,
  ApplyInput,
  ApplyResult,
  CandidateApplyInput,
  CandidateApplyResult,
  CareerJob,
  CareerJobDetail,
  CareersSite,
  JobBoardPage,
} from "@/types/careers";

// The public job pages, without sign-in: Hirvello's job board (/jobs) lists the open, public jobs made in
// Hirvello by recruiting teams and small businesses; the demo (/demo/careers) is development only. Every demo
// route answers 404 while the demo is switched off (ENABLE_ASHBY_DEMO isn't set, or in production), and mock
// mode has no API behind it at all, so then there's nothing to list.

/** Published jobs, newest first; null when the demo careers site is turned off (or in mock mode). */
export async function listCareerJobs(site: CareersSite = "demo"): Promise<CareerJob[] | null> {
  if (USE_MOCK_API) return null;
  try {
    return (await apiFetch<ApiCareerJobSummary[]>(`${apiBase(site)}/jobs`)).map(fromSummary);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * GET /careers/search: one page of the job board for the state in its URL, with the count behind each tab.
 * Called while rendering on the server. Mock mode has no board, so it's an empty one.
 */
export async function searchJobs(query: BoardQuery): Promise<JobBoardPage> {
  const params = apiSearchParams(query);
  if (USE_MOCK_API) {
    return { jobs: [], total: 0, counts: { all: 0, recruiter: 0, small_business: 0 }, limit: Number(params.get("limit")), offset: 0 };
  }
  const page = await apiFetch<ApiJobBoardPage>(`/careers/search?${params}`);
  return {
    jobs: page.items.map(fromSummary),
    total: page.total,
    counts: { all: page.counts.all, recruiter: page.counts.recruiter, small_business: page.counts.small_business },
    limit: page.limit,
    offset: page.offset,
  };
}

/** One job on the board; null when it isn't (a draft, closed, private, expired, unknown, not a UUID) or the site is off. */
export async function getCareerJob(id: string, site: CareersSite = "demo"): Promise<CareerJobDetail | null> {
  if (USE_MOCK_API) return null;
  try {
    return fromDetail(await apiFetch<ApiCareerJobDetail>(`${apiBase(site)}/jobs/${encodeURIComponent(id)}`));
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) return null;
    throw error;
  }
}

/**
 * Apply without an account. The demo (POST /demo/careers/jobs/{id}/apply) keeps the application pending until
 * the applicant activates their portal account or signs in; the board's (POST /careers/jobs/{id}/apply) is in at
 * once, and the portal link comes by email. The result says which.
 */
export async function applyToJob(id: string, input: ApplyInput, site: CareersSite = "demo"): Promise<ApplyResult> {
  if (USE_MOCK_API) throw new ApiError("Applying needs the Hirvello API.", 404, "not_found");
  if (site === "native") return applyNative(id, input);
  const body: ApiCareerApplicationCreate = {
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone: input.phone,
    linkedin_url: input.linkedinUrl,
    resume: { file_name: input.resume.fileName, content_type: input.resume.contentType, data: input.resume.data },
  };
  const result = await apiFetch<ApiCareerApplicationResult>(`/demo/careers/jobs/${encodeURIComponent(id)}/apply`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { status: result.status, email: result.email, jobTitle: result.job_title };
}

/** POST /careers/jobs/{id}/apply: the application exists at once; the portal link comes by email. */
async function applyNative(id: string, input: ApplyInput): Promise<ApplyResult> {
  const result = await apiFetch<ApiNativeApplicationResult>(`/careers/jobs/${encodeURIComponent(id)}/apply`, {
    method: "POST",
    body: JSON.stringify({
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      phone: input.phone || null,
      linkedin_url: input.linkedinUrl,
      availability: input.availability ?? [],
      experience_note: input.experienceNote || null,
      resume: { file_name: input.resume.fileName, content_type: input.resume.contentType, data: input.resume.data },
    }),
  });
  const status =
    result.status === "already_applied" ? "already_applied" : result.portal_link === "unavailable" ? "link_unavailable" : "submitted";
  return {
    status,
    portalLink: result.portal_link,
    email: result.email,
    jobTitle: result.job_title,
    company: result.company ?? null,
  };
}

/**
 * POST /candidate/jobs/{id}/apply, as the signed-in candidate: their name and email come from their account,
 * and the application is in their portal at once. Applying twice changes nothing ("already_applied").
 */
export async function applyAsCandidate(id: string, input: CandidateApplyInput): Promise<CandidateApplyResult> {
  if (USE_MOCK_API) throw new ApiError("Applying needs the Hirvello API.", 404, "not_found");
  const body: ApiCandidateApplicationCreate = {
    phone: input.phone || null,
    linkedin_url: input.linkedinUrl,
    availability: input.availability,
    experience_note: input.experienceNote || null,
    resume: { file_name: input.resume.fileName, content_type: input.resume.contentType, data: input.resume.data },
  };
  const result = await apiFetch<ApiCandidateApplyResult>(`/candidate/jobs/${encodeURIComponent(id)}/apply`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { status: result.status, applicationId: result.application_id, jobTitle: result.job_title, company: result.company };
}

function apiBase(site: CareersSite): string {
  return site === "native" ? "/careers" : "/demo/careers";
}

function fromSummary(job: ApiCareerJobSummary): CareerJob {
  return {
    id: job.id,
    title: job.title,
    company: job.company ?? null,
    companyLogoUrl: job.company_logo_url ?? null,
    source: job.source ?? null,
    department: job.department,
    location: job.location,
    workArrangement: job.work_arrangement,
    employmentType: job.employment_type,
    seniority: job.seniority,
    salary: formatPayRange(job.salary_min, job.salary_max, job.salary_currency, job.salary_period),
    salaryMin: job.salary_min,
    salaryMax: job.salary_max,
    salaryCurrency: job.salary_currency ?? null,
    salaryPeriod: job.salary_period ?? null,
    summary: job.summary,
    publishedAt: job.published_at,
    expiresAt: job.expires_at ?? null,
    pay: job.pay ?? null,
    shift: job.shift ?? null,
    workDays: job.work_days ?? [],
    openings: job.openings ?? null,
  };
}

function fromDetail(job: ApiCareerJobDetail): CareerJobDetail {
  return {
    ...fromSummary(job),
    aboutRole: job.about_role,
    responsibilities: job.responsibilities ?? [],
    requirements: job.requirements ?? [],
    preferredQualifications: job.preferred_qualifications ?? [],
    skills: job.skills ?? [],
    aboutTeam: job.about_team,
  };
}
