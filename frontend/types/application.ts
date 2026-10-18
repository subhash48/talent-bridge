// Mirrors backend/app/schemas/application.py.
export type ApplicationStage =
  | "sourced"
  | "applied"
  | "screening"
  | "interview"
  | "final_interview"
  | "offer"
  | "hired"
  | "rejected";

export type ApplicationStatus = "active" | "on_hold" | "withdrawn" | "archived";

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  sourced: "Sourced",
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  final_interview: "Final interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

export type Application = {
  id: string;
  candidate_id: string;
  job_id: string;
  owner_id: string | null;
  stage: ApplicationStage;
  stage_entered_at: string;
  status: ApplicationStatus;
  updated_at: string;
};
