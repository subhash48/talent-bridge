import type { ApplicationStage } from "@/types/application";
import type { EngagementLevel, EngagementSignal } from "@/types/event";
import type { InterviewStatus } from "@/types/interview";
import type { JobStatus } from "@/types/job";

// View models for the Recruiter Workspace. services/* map API responses into these shapes,
// so components never depend on the backend's wire format.

export const PIPELINE_STAGES = [
  "sourced",
  "screening",
  "interview",
  "offer",
  "hired",
] as const satisfies readonly ApplicationStage[];

export type CandidateStage = (typeof PIPELINE_STAGES)[number];

export type CandidateRef = {
  /** Application id: one candidate applying to one job. */
  id: string;
  name: string;
  role: string;
  avatarUrl?: string;
};

export type PipelineCandidate = CandidateRef & {
  email?: string;
  location?: string;
  pronouns?: string;
  stage: CandidateStage;
  lastActivity: string;
  lastActivityAt: string;
  engagement: EngagementLevel;
  /** Present when the next-action engine says the recruiter owes this candidate a reply. */
  followUp?: { reason: string };
  nextStep?: { title: string; date: string };
  skills: string[];
  addedAt: string;
};

export type ActivityKind =
  | "sourced"
  | "stage"
  | "message"
  | "document"
  | "question"
  | "assessment"
  | "interview"
  | "offer";

export type CandidateActivity = {
  id: string;
  candidateId: string;
  kind: ActivityKind;
  label: string;
  occurredAt: string;
};

export type InterviewFormat = "video" | "onsite" | "phone";

export type ScheduledInterview = {
  id: string;
  candidate: CandidateRef;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  format: InterviewFormat;
  interviewers: string[];
  status: InterviewStatus;
  feedback?: "pending" | "submitted";
};

export type MessageAuthor = "recruiter" | "candidate";

export type ThreadMessage = {
  id: string;
  author: MessageAuthor;
  body: string;
  sentAt: string;
};

export type Conversation = {
  candidate: CandidateRef;
  messages: ThreadMessage[];
  unread: number;
};

export type CandidateDetail = {
  activities: CandidateActivity[];
  interviews: ScheduledInterview[];
  messages: ThreadMessage[];
  signals: EngagementSignal[];
};

export type JobOpening = {
  id: string;
  title: string;
  department: string;
  location: string;
  employmentType: string;
  status: JobStatus;
  hiringManager: string;
  openedAt: string;
  summary: string;
};

export type MetricKey = "total" | "interviews" | "followUp" | "offers";

export type DashboardSummary = {
  /** Percentage change against the previous 30 days, per metric. */
  trends: Record<MetricKey, number>;
};

export type CurrentUser = {
  id: string;
  name: string;
  title: string;
  email: string;
  organization: string;
  avatarUrl?: string;
};

export type NewCandidateInput = {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  location: string;
  stage: CandidateStage;
};
