import type { EngagementLevel } from "@/types/event";

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

export type NextAction = {
  type: string;
  label: string;
  reason: string | null;
  follow_up: boolean;
};

export type DashboardRow = {
  application_id: string;
  candidate: { id: string; name: string; avatar_url: string | null };
  job: { id: string; title: string };
  stage: ApplicationStage;
  last_activity: { at: string; label: string } | null;
  engagement: { level: EngagementLevel; top_signal: string | null };
  next_action: NextAction;
};

// GET /v1/dashboard (ARCHITECTURE.md 8.5).
export type DashboardResponse = {
  greeting: { name: string; summary: string };
  metrics: { total_candidates: number; in_interviews: number; need_follow_up: number; offers: number };
  rows: DashboardRow[];
};

