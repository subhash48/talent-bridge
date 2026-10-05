import type { DemographicAnswers } from "@/lib/demographics";

// The public demo careers site (/demo/careers, development only). The wire format mirrors
// backend/app/schemas/demo.py; services/careers.ts maps it into the view models below, so components
// never depend on it directly.

/** CareerJobSummary: a published demo job, as the careers site lists it. */
export type ApiCareerJobSummary = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  work_arrangement: string | null;
  employment_type: string;
  seniority: string | null;
  /** The yearly pay range the recruiter set, in whole units of salary_currency. */
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  summary: string | null;
  published_at: string | null;
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
  /** Optional, every question; only the answered ones are sent. */
  demographics?: Partial<DemographicAnswers>;
};

/**
 * What happened to an application: check your inbox and activate your account, sign in to submit it
 * (the email already has a portal account), already submitted, or saved but the activation email
 * couldn't be sent (applying again retries it).
 */
export type ApplyOutcome = "invitation_sent" | "sign_in_required" | "already_applied" | "invitation_failed";

export type ApiCareerApplicationResult = { status: ApplyOutcome; email: string; job_title: string };

// View models.

export type CareerJob = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  /** "On-site", "Hybrid" or "Remote". */
  workArrangement: string | null;
  employmentType: string;
  seniority: string | null;
  /** "$100K–$130K", when the recruiter set a range. */
  salary: string | null;
  summary: string | null;
  publishedAt: string | null;
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
  demographics: DemographicAnswers;
};

export type ApplyResult = { status: ApplyOutcome; email: string; jobTitle: string };

/** The largest résumé the API accepts (backend MAX_RESUME_BYTES). */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
