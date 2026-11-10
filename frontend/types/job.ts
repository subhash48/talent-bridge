// Mirrors backend/app/schemas/job.py.
import type { JobOpening } from "@/types/workspace";

export type JobStatus = "draft" | "open" | "closed";

export type Job = {
  id: string;
  title: string;
  team_id: string | null;
  department: string | null;
  location: string | null;
  employment_type: string;
  salary_range_public: string | null;
  status: JobStatus;
  created_at: string;
};

/** Where the work happens (backend core/enums.py WorkArrangement). Null on a job means "not specified". */
export type JobWorkArrangement = "onsite" | "hybrid" | "remote";
export type SalaryPeriod = "year" | "month" | "hour";
/** A private job is never on the Hirvello job board; it still takes the applicants the employer adds. */
export type JobVisibility = "public" | "private";
/** Who posted the job, from the employer's workspace when it was created. Set by the API, never by a form. */
export type JobSource = "recruiter" | "small_business";

export const WORK_ARRANGEMENTS: { value: JobWorkArrangement; label: string }[] = [
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];
export const SALARY_CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD"] as const;
/** label names the period in a form; suffix follows a figure: "$120K–$150K a year". */
export const SALARY_PERIODS: { value: SalaryPeriod; label: string; suffix: string }[] = [
  { value: "year", label: "Year", suffix: "a year" },
  { value: "month", label: "Month", suffix: "a month" },
  { value: "hour", label: "Hour", suffix: "an hour" },
];
/** The API's bounds for a salary figure (JobCreate salary_min / salary_max). */
export const SALARY_LIMIT = 10_000_000;

/** The job board fields JobRead adds to a job (migration 022). */
export type ApiJobBoardFields = {
  work_arrangement: JobWorkArrangement | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: SalaryPeriod | null;
  /** After this the job leaves the board and stops taking applications. */
  expires_at: string | null;
  visibility: JobVisibility;
  posted_by: JobSource;
  /** The first time the job opened; null while it has never been open. */
  published_at: string | null;
};

/** What JobCreate / JobUpdate accept for the board. posted_by and published_at are the API's to set. */
export type ApiJobBoardInput = Omit<ApiJobBoardFields, "posted_by" | "published_at">;

/** The board settings an employer chooses for a job. */
export type JobBoardSettings = {
  workArrangement: JobWorkArrangement | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  expiresAt: string | null;
  visibility: JobVisibility;
};

/** A job as its employer manages it: the workspace's view plus what the job board shows. */
export type ManagedJob = JobOpening &
  JobBoardSettings & {
    /** The whole description, for editing. JobOpening.summary is its first paragraph. */
    description: string;
    /** Imported from Ashby, or a development demo job: those are never on the Hirvello job board. */
    external: boolean;
    postedBy: JobSource;
    publishedAt: string | null;
  };
