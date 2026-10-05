import type { JobStatus } from "@/types/job";

// Mirrors backend/app/schemas/demo.py, the recruiter half: demo jobs and the AI job writer. The public
// careers site's types are in types/careers.ts. Development only: the API answers 404 to every demo
// route unless ENABLE_ASHBY_DEMO is on, and always in production.

export const WORK_ARRANGEMENTS = ["On-site", "Hybrid", "Remote"] as const;
export const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Temporary"] as const;
export const SENIORITIES = ["Internship", "Entry Level", "Mid Level", "Senior", "Staff", "Principal", "Manager", "Director"] as const;

export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type Seniority = (typeof SENIORITIES)[number];

// The API's limits for a posting's text and lists.
export const MAX_SUMMARY = 600;
export const MAX_ABOUT_ROLE = 3000;
export const MAX_ABOUT_TEAM = 1500;
export const MAX_NOTES = 1000;
export const MAX_ITEM = 300;
export const MAX_ITEMS = 12;
export const MAX_SKILL = 40;
export const MAX_SKILLS = 20;

/** The posting, on the demo careers site. The job's own status in the ATS is separate (JobStatus). */
export type DemoPostingStatus = "draft" | "published" | "closed";

/** What the AI job writer drafts from (POST /demo/jobs/generate). */
export type JobPostingBrief = {
  title: string;
  department?: string | null;
  location?: string | null;
  work_arrangement?: WorkArrangement | null;
  employment_type?: EmploymentType;
  seniority?: Seniority | null;
  skills?: string[];
  notes?: string | null;
};

/** A posting's text, as the AI job writer drafts it and the recruiter edits it. */
export type JobPostingContent = {
  summary: string;
  about_role: string;
  responsibilities: string[];
  requirements: string[];
  preferred_qualifications: string[];
  skills: string[];
  about_team: string | null;
};

/** A draft for the recruiter to review and edit. Nothing is saved, and nothing is published. */
export type GeneratedJobPosting = {
  draft: JobPostingContent;
  /** The model that wrote it, or "mock (fallback from groq)" when the AI service failed and a template wrote it. */
  model_name: string;
  /** Lines the posting policy left out because they mentioned a personal (protected) characteristic. */
  removed: number;
};

/** POST /demo/jobs. A new demo job is always a draft; publishing it is a separate call. */
export type DemoJobCreate = {
  title: string;
  department?: string | null;
  location?: string | null;
  work_arrangement?: WorkArrangement | null;
  employment_type?: EmploymentType;
  seniority?: Seniority | null;
  /** The yearly pay range, in whole units of salary_currency. The AI job writer never sets it. */
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  skills?: string[];
  notes?: string | null;
  summary?: string | null;
  about_role?: string | null;
  responsibilities?: string[];
  requirements?: string[];
  preferred_qualifications?: string[];
  about_team?: string | null;
  generated_by_model?: string | null;
};

/** PATCH /demo/jobs/{id}: only the fields sent change. null clears an optional text field; [] clears a list. */
export type DemoJobUpdate = Partial<DemoJobCreate>;

/** A demo job as the recruiter manages it. id is the job's, so /recruiter/jobs/{id} shows its pipeline. */
export type DemoJob = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  work_arrangement: string | null;
  employment_type: string;
  seniority: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  skills: string[];
  /** The recruiter's notes for the AI job writer; never on the careers site. */
  notes: string | null;
  summary: string | null;
  about_role: string | null;
  responsibilities: string[];
  requirements: string[];
  preferred_qualifications: string[];
  about_team: string | null;
  /** The model that drafted the text, when the AI job writer did; the recruiter may have edited it since. */
  generated_by_model: string | null;
  status: DemoPostingStatus;
  /** The job itself, in the ATS. Unpublishing leaves it open for the people who already applied. */
  job_status: JobStatus;
  /** The latest publish. */
  published_at: string | null;
  closed_at: string | null;
  /** Applications submitted (the applicant activated their account), at any stage. */
  applicant_count: number;
  /** Careers applications waiting for the applicant to activate their account or sign in. */
  pending_count: number;
  /** The posting on the careers site: /demo/careers/{id}. */
  public_path: string;
  created_at: string;
  updated_at: string;
};
