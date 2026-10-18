import type { ApplicationStage } from "@/types/application";

// Mirrors backend/app/schemas/assistant.py: the recruiter assistant, one action engine for typed and
// spoken requests about candidate communication. Messages come back as proposals that only go out
// when the recruiter confirms.

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

export type AssistantContext = { application_id: string | null; action_id: string | null };

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

export type CandidateListCard = { type: "candidates"; title: string; total: number; items: CandidateBrief[] };

/** Candidates owed something: an update, a reply, an interview confirmation or follow-up. */
export type FollowUpListCard = {
  type: "follow_ups";
  title: string;
  total: number;
  items: { candidate: CandidateBrief; reason: string; detail: string | null; since: string | null; at: string | null }[];
  href: string;
};

export type ClarifyCard = {
  type: "clarify";
  question: string;
  options: { label: string; detail: string; reply: string; application_id: string | null }[];
};

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

export type AssistantCard = MessageCard | CandidateListCard | FollowUpListCard | ClarifyCard | InterviewInfoCard;

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

export type AssistantStatus = { voice_transcription: boolean; model_name: string };
