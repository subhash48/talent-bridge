
// The careers sites: Hirvello's public job board (/jobs) and the development-only demo (/demo/careers),
// which show jobs the same way. The wire format mirrors
// backend/app/schemas/demo.py; services/careers.ts maps it into the view models below, so components
// never depend on it directly.

import type { Weekday } from "@/lib/days";

/** Who posted a job on the board: a recruiting team's workspace, or a small business on Simple Hire. */
export type JobSource = "recruiter" | "small_business";

/** What a salary range is per. */
export type SalaryPeriod = "year" | "month" | "hour";

/** CareerJobSummary: a job as the board (or the demo careers site) lists it. */
export type ApiCareerJobSummary = {
  id: string;
  title: string;
  /** The employer (job -> company). Only Hirvello's own board names it. */
  company?: string | null;
  /** The employer's logo; null when it has none. */
  company_logo_url?: string | null;
  /** Who posted it, fixed when it was posted; null on the demo site. */
  source?: JobSource | null;
  department: string | null;
  location: string | null;
  /** "On-site", "Hybrid" or "Remote". */
  work_arrangement: string | null;
  employment_type: string;
  seniority: string | null;
  /** The pay range the employer set, in whole units of salary_currency, per salary_period (a year when unset). */
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period?: SalaryPeriod | null;
  summary: string | null;
  published_at: string | null;
  /** After this the job leaves the board and stops taking applications. */
  expires_at?: string | null;
  /** A small business's job, in the employer's words (Hirvello's own careers site). */
  pay?: string | null;
  shift?: string | null;
  work_days?: Weekday[];
  openings?: number | null;
};

export type ApiCareerJobDetail = ApiCareerJobSummary & {
  about_role: string | null;
  responsibilities: string[];
  requirements: string[];
  preferred_qualifications: string[];
  skills: string[];
  about_team: string | null;
};

/** The résumé, base64-encoded without a data: prefix. The API decides its type from its content. */
export type ApiResumeUpload = { file_name: string; content_type: string; data: string };

export type ApiCareerApplicationCreate = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  linkedin_url: string | null;
  resume: ApiResumeUpload;
};

/**
 * What happened to an application: check your inbox and activate your account, sign in to submit it
 * (the email already has a portal account), already submitted, or saved but the activation email
 * couldn't be sent (applying again retries it).
 */
export type ApplyOutcome =
  | "invitation_sent"
  | "sign_in_required"
  | "already_applied"
  | "invitation_failed"
  // Hirvello's own site: the application is in, and the portal link was emailed (or couldn't be).
  | "submitted"
  | "link_unavailable";

/** Which careers site: Hirvello's own, or the development-only demo through the Ashby simulator. */
export type CareersSite = "native" | "demo";

export const CAREERS_PATHS: Record<CareersSite, string> = { native: "/jobs", demo: "/demo/careers" };

/** POST /careers/jobs/{id}/apply: created at once; how the portal link reached them. */
export type ApiNativeApplicationResult = {
  status: "submitted" | "already_applied";
  portal_link: "invitation_sent" | "sign_in_link_sent" | "unavailable";
  email: string;
  job_title: string;
  company?: string | null;
  /** Hirvello emailed its own confirmation, with the link in it. */
  confirmation_emailed?: boolean;
};

export type ApiCareerApplicationResult = { status: ApplyOutcome; email: string; job_title: string };

/** GET /careers/search: one page of the board. counts ignore the source filter, so every tab's count is honest. */
export type ApiJobBoardPage = {
  items: ApiCareerJobSummary[];
  /** Every job matching the filters, the source included. */
  total: number;
  counts: { all: number; recruiter: number; small_business: number };
  limit: number;
  offset: number;
};

/** POST /candidate/jobs/{id}/apply: a signed-in candidate's name and email come from their account. */
export type ApiCandidateApplicationCreate = {
  phone: string | null;
  resume: ApiResumeUpload;
  linkedin_url: string | null;
  availability: Weekday[];
  experience_note: string | null;
};

export type ApiCandidateApplyResult = {
  status: "submitted" | "already_applied";
  application_id: string;
  job_title: string;
  company: string;
};

// View models.

export type CareerJob = {
  id: string;
  title: string;
  /** The employer; null on the demo site. */
  company: string | null;
  companyLogoUrl: string | null;
  /** Who posted it; null on the demo site. */
  source: JobSource | null;
  department: string | null;
  location: string | null;
  /** "On-site", "Hybrid" or "Remote". */
  workArrangement: string | null;
  employmentType: string;
  seniority: string | null;
  /** "$120k–$150k a year" or "$18–$22 an hour", when the employer set a range. */
  salary: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  summary: string | null;
  publishedAt: string | null;
  /** When it stops taking applications, if the employer set a date. */
  expiresAt: string | null;
  /** "$18/hour", as the employer said it. */
  pay: string | null;
  /** "Evenings". */
  shift: string | null;
  /** The days the job needs; the application asks which of them the applicant can work. */
  workDays: Weekday[];
  openings: number | null;
};

export type CareerJobDetail = CareerJob & {
  aboutRole: string | null;
  responsibilities: string[];
  requirements: string[];
  preferredQualifications: string[];
  skills: string[];
  aboutTeam: string | null;
};

export type ResumeUpload = {
  fileName: string;
  /** What the browser reports, which may be empty. */
  contentType: string;
  /** Base64, without the data: prefix. */
  data: string;
};

export type ApplyInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  linkedinUrl: string | null;
  resume: ResumeUpload;
  /** Which of the job's work days they can work (Hirvello's own site, for a job that lists them). */
  availability?: Weekday[];
  /** Their relevant experience, in their own words. */
  experienceNote?: string | null;
};

export type ApplyResult = {
  /** Hirvello's own site: how the portal link reached them. */
  portalLink?: ApiNativeApplicationResult["portal_link"];
  status: ApplyOutcome;
  email: string;
  jobTitle: string;
  /** The employer, on Hirvello's own site. */
  company?: string | null;
};

/** One page of the board, with the count behind each tab. */
export type JobBoardPage = {
  jobs: CareerJob[];
  total: number;
  counts: Record<"all" | JobSource, number>;
  limit: number;
  offset: number;
};

/** A signed-in candidate's application: who they are comes from their account. */
export type CandidateApplyInput = {
  phone: string;
  linkedinUrl: string | null;
  resume: ResumeUpload;
  availability: Weekday[];
  experienceNote: string | null;
};

export type CandidateApplyResult = {
  status: "submitted" | "already_applied";
  applicationId: string;
  jobTitle: string;
  company: string;
};

/** The largest résumé the API accepts (backend MAX_RESUME_BYTES). */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
