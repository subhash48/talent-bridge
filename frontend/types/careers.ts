
// The careers sites: Kavuntra's own (/careers) and the development-only demo (/demo/careers),
// which show jobs the same way. The wire format mirrors
// backend/app/schemas/demo.py; services/careers.ts maps it into the view models below, so components
// never depend on it directly.

import type { Weekday } from "@/lib/days";

/** CareerJobSummary: a published demo job, as the careers site lists it. */
export type ApiCareerJobSummary = {
  id: string;
  title: string;
  /** The employer (job -> company). Only Kavuntra's own careers site names it. */
  company?: string | null;
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
  /** A small business's job, in the employer's words (Kavuntra's own careers site). */
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
  // Kavuntra's own site: the application is in, and the portal link was emailed (or couldn't be).
  | "submitted"
  | "link_unavailable";

/** Which careers site: Kavuntra's own, or the development-only demo through the Ashby simulator. */
export type CareersSite = "native" | "demo";

export const CAREERS_PATHS: Record<CareersSite, string> = { native: "/careers", demo: "/demo/careers" };

/** POST /careers/jobs/{id}/apply: created at once; how the portal link reached them. */
export type ApiNativeApplicationResult = {
  status: "submitted" | "already_applied";
  portal_link: "invitation_sent" | "sign_in_link_sent" | "unavailable";
  email: string;
  job_title: string;
  company?: string | null;
  /** Kavuntra emailed its own confirmation, with the link in it. */
  confirmation_emailed?: boolean;
};

export type ApiCareerApplicationResult = { status: ApplyOutcome; email: string; job_title: string };

// View models.

export type CareerJob = {
  id: string;
  title: string;
  /** The employer; null on the demo site. */
  company: string | null;
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
  /** Which of the job's work days they can work (Kavuntra's own site, for a job that lists them). */
  availability?: Weekday[];
  /** Their relevant experience, in their own words. */
  experienceNote?: string | null;
};

export type ApplyResult = {
  /** Kavuntra's own site: how the portal link reached them. */
  portalLink?: ApiNativeApplicationResult["portal_link"];
  status: ApplyOutcome;
  email: string;
  jobTitle: string;
  /** The employer, on Kavuntra's own site. */
  company?: string | null;
};

/** The largest résumé the API accepts (backend MAX_RESUME_BYTES). */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
