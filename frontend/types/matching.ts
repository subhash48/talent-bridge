import type { Weekday } from "@/lib/days";
import type { ApplicationStage } from "@/types/application";

// Mirrors backend/app/schemas/matching.py: candidates against job-related criteria the recruiter chose,
// each with where their application shows them. No scores; the recruiter decides who to contact.

/** Where it was found: their listed skills, headline or résumé, or what they wrote in this application. */
export type EvidenceSource = "skills" | "headline" | "resume" | "application";
export type InterviewState = "upcoming" | "interviewed" | "awaiting_update" | "none";

export type MatchRequest = {
  job_ids?: string[];
  /** Empty with job_ids: the jobs' own listed requirements. */
  skills?: string[];
  stage?: ApplicationStage;
  location?: string;
  interview?: InterviewState;
  communication?: "needs_attention" | "due_soon" | "on_track";
  messaging?: boolean;
  /** Days the applicants said they can work: shown per candidate, found or not. */
  available_days?: Weekday[];
  /** Only these applications: the ones on screen. */
  application_ids?: string[];
  limit?: number;
};

export type MatchEvidence = {
  criterion: string;
  matched: boolean;
  source: EvidenceSource | null;
  kind?: "criterion" | "availability";
  /** As a person reads it: "Kitchen experience", "Restaurant experience" (related work), "Friday available". */
  label?: string;
  /** The words it was found in. */
  quote?: string | null;
};

export type CandidateMatch = {
  application_id: string;
  candidate_id: string;
  name: string;
  job_id: string;
  job_title: string;
  company_name: string;
  stage: ApplicationStage;
  location: string | null;
  applied_at: string;
  matched: number;
  evidence: MatchEvidence[];
  experience: { label: string; source: EvidenceSource; quote: string } | null;
};

export type MatchResult = {
  criteria: string[];
  available_days?: Weekday[];
  criteria_source: "recruiter" | "job_requirements" | "none";
  filters: { key: string; label: string }[];
  considered: number;
  matching: number;
  limit: number;
  items: CandidateMatch[];
  order: string;
};

/** The shortlist sizes offered; any other number is Custom. */
export const SHORTLIST_SIZES = [5, 10, 20] as const;

export const SOURCE_LABELS: Record<EvidenceSource, string> = {
  skills: "listed skill",
  headline: "headline",
  resume: "résumé",
  application: "their application",
};
