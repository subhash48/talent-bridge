import type { ApplicationStage } from "@/types/application";
import type { CandidateMatch, InterviewState } from "@/types/matching";

// Mirrors backend/app/schemas/assistant.py: the recruiter assistant, one action engine for typed and
// spoken requests about candidate communication, finding candidates on job-related criteria, outreach to
// the ones the recruiter ticks, and new jobs. Messages, interviews and jobs come back as proposals that
// only happen when the recruiter approves them.

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

/** The candidate list on screen: its filters and criteria, so the next request can narrow it. */
export type SearchState = {
  job_ids: string[];
  skills: string[];
  stage: ApplicationStage | null;
  location: string | null;
  interview: InterviewState | null;
  communication: "needs_attention" | "due_soon" | "on_track" | "closed" | null;
  limit: number;
};

export type AssistantContext = {
  application_id: string | null;
  action_id: string | null;
  /** "That role": the job just created or discussed. */
  job_id?: string | null;
  search?: SearchState | null;
  /** The candidates the recruiter ticked; outreach is only ever for them. */
  selected_application_ids?: string[];
};

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

/** Candidates against job-related criteria, with the filters behind the list and each one's evidence. */
export type CandidateMatchCard = {
  type: "candidate_match";
  title: string;
  filters: { key: string; label: string }[];
  criteria: string[];
  criteria_source: "recruiter" | "job_requirements" | "none";
  considered: number;
  matching: number;
  limit: number;
  items: CandidateMatch[];
  order: string;
  selected: string[];
  /** The same list on the Candidates page, with the same filters. */
  href: string;
};

export type OutreachResult = {
  message_sent: boolean;
  email: "sent" | "failed" | "pending" | "not_configured" | null;
  interview_created: boolean;
  calendar: "created" | "not_configured" | "failed" | null;
  messaging_enabled: boolean;
  error: string | null;
};

export type OutreachItem = {
  candidate: CandidateBrief;
  company_name: string;
  draft_id: string;
  subject: string;
  body: string;
  include: boolean;
  /** The candidate can already write back about this application. */
  replies_open: boolean;
  slot: { starts_at: string; ends_at: string } | null;
  result: OutreachResult | null;
};

export type InterviewFormat = "video" | "phone" | "onsite";

export type ScheduleProposal = {
  title: string;
  interview_type: InterviewFormat;
  duration_minutes: number;
  day: string | null;
  window_start: string;
  window_end: string;
  utc_offset_minutes: number;
  interviewers: string[];
  /** Only a link the recruiter gave: no video service is connected. */
  meeting_url: string | null;
  calendar_configured: boolean;
  calendar_note: string;
  unscheduled: number;
};

/** One personal draft per candidate picked, and interview times if proposed. */
export type OutreachCard = {
  type: "outreach";
  action_id: string;
  status: ActionStatus;
  stage: "review" | "final" | "done";
  purpose: string;
  items: OutreachItem[];
  schedule: ScheduleProposal | null;
  enable_replies: boolean;
  email_configured: boolean;
  delivery_note: string;
  error: string | null;
};

export type WorkArrangement = "On-site" | "Hybrid" | "Remote";
export type EmploymentType = "Full-time" | "Part-time" | "Contract" | "Internship" | "Temporary";
export type Seniority = "Internship" | "Entry Level" | "Mid Level" | "Senior" | "Staff" | "Principal" | "Manager" | "Director";

export type JobDraft = {
  title: string;
  department: string | null;
  location: string | null;
  work_arrangement: WorkArrangement | null;
  employment_type: EmploymentType;
  seniority: Seniority | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  skills: string[];
  summary: string | null;
  responsibilities: string[];
  requirements: string[];
  preferred_qualifications: string[];
  description: string | null;
};

/** A job drafted from what the recruiter said. Not a job until they approve it. */
export type JobDraftCard = {
  type: "job_draft";
  action_id: string;
  status: ActionStatus;
  stage: "draft" | "confirm" | "created";
  draft: JobDraft;
  /** What they didn't say, left for them: "Salary: not given, and never guessed". */
  missing: string[];
  changes: string[];
  job_id: string | null;
  job_href: string | null;
  careers_href: string | null;
  model_name: string;
  error: string | null;
};

export type AssistantCard =
  | MessageCard
  | FollowUpListCard
  | ClarifyCard
  | InterviewInfoCard
  | CandidateMatchCard
  | OutreachCard
  | JobDraftCard;

/** The recruiter's edits, sent with an approval. */
export type ConfirmEdits = {
  body?: string;
  items?: { application_id: string; include: boolean; subject?: string; body?: string }[];
  schedule?: { title?: string; interview_type?: InterviewFormat; interviewers?: string[]; meeting_url?: string | null };
  enable_replies?: boolean;
  job?: JobDraft;
};

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

export type AssistantStatus = {
  voice_transcription: boolean;
  model_name: string;
  email_configured: boolean;
  calendar_configured: boolean;
};

/** POST /assistant/outreach: the Candidates page's "Draft personalised outreach". */
export type OutreachRequest = {
  application_ids: string[];
  purpose: "interview_invitation" | "message";
  instructions?: string;
  schedule?: {
    interview_type?: string;
    duration_minutes?: number;
    timeframe?: string;
    window_start?: string;
    window_end?: string;
  };
};
