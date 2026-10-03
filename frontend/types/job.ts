// Mirrors backend/app/schemas/job.py.
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
