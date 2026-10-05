import type { ApplicationStage } from "@/types/application";

// Mirrors backend/app/schemas/assistant.py: the recruiter assistant, one action engine for typed and
// spoken requests. External actions come back as proposals that only run when the recruiter confirms.

export type InputType = "text" | "voice";

export type ActionStatus =
  | "processing"
  | "answered"
  | "needs_clarification"
  | "proposed"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export type AssistantContext = { application_id: string | null; job_id: string | null; action_id: string | null };

export type CandidateBrief = { application_id: string; candidate_id: string; name: string; job_title: string; stage: ApplicationStage };

export type MessageCard = {
  type: "message";
  action_id: string;
  mode: "draft" | "execute";
  status: ActionStatus;
  candidate: CandidateBrief;
  purpose: string;
  interview_type: string | null;
  duration_minutes: number | null;
  timeframe: string | null;
  body: string;
  delivery: string;
  error: string | null;
};

export type JobCard = {
  type: "job";
  action_id: string | null;
  status: ActionStatus;
  stage: "draft_created" | "draft_updated" | "ready_to_publish" | "published";
  job: {
    id: string;
    title: string;
    location: string | null;
    work_arrangement: string | null;
    seniority: string | null;
    employment_type: string;
    salary: string | null;
    skills: string[];
    summary: string | null;
    status: string;
    review_path: string;
    public_path: string;
  };
  changes: string[];
};

export type CandidateListCard = { type: "candidates"; title: string; total: number; items: CandidateBrief[] };

export type JobListCard = {
  type: "jobs";
  items: { id: string; title: string; location: string | null; status: string; candidates: number }[];
};

export type ClarifyCard = {
  type: "clarify";
  question: string;
  options: { label: string; detail: string; reply: string; application_id: string | null }[];
};

export type AnalyticsCard = { type: "analytics"; title: string; period: string; rows: { label: string; value: string }[]; href: string };

export type InterviewInfoCard = {
  type: "interview";
  candidate: CandidateBrief;
  interview: {
    title: string;
    scheduled_at: string;
    duration_minutes: number;
    interview_type: string;
    confirmed: boolean;
    interviewers: string[];
  } | null;
};

export type AssistantCard = MessageCard | JobCard | CandidateListCard | JobListCard | ClarifyCard | AnalyticsCard | InterviewInfoCard;

export type AssistantSource = { type: string; id: string; label: string };

export type AssistantResponse = {
  id: string;
  input_type: InputType;
  transcript: string;
  intent: string | null;
  status: ActionStatus;
  reply: string;
  cards: AssistantCard[];
  sources: AssistantSource[];
  context: AssistantContext;
  model_name: string;
};

export type AssistantHistoryItem = {
  id: string;
  created_at: string;
  executed_at: string | null;
  input_type: InputType;
  input_text: string;
  intent: string | null;
  status: ActionStatus;
  summary: string;
  target_label: string | null;
  href: string | null;
};

export type AssistantStatus = { voice_transcription: boolean; jobs: boolean; model_name: string };
