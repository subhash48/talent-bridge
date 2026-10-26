import type { ApplicationStage } from "@/types/application";
import type { CommunicationHealth, CommunicationSummary, MessageDelivery } from "@/types/communication";
import type { Role } from "@/types/candidate";
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

/** The candidate's portal sign-in: never set up, waiting to be invited, invited, signed in, or failed. */
export type PortalAccessStatus = "not_required" | "pending_invitation" | "invited" | "active" | "invite_failed";

export type CandidateRef = {
  /** Application id: one candidate applying to one job. */
  id: string;
  name: string;
  role: string;
  avatarUrl?: string;
};

export type PipelineCandidate = CandidateRef & {
  /** The person; one person can have applications to several jobs. */
  candidateId: string;
  jobId?: string;
  /** The application's employer. */
  company?: string;
  email?: string;
  phone?: string;
  /** An http(s) link, or an API path (/api/v1/...) to a file only signed-in recruiters can download. */
  resumeUrl?: string;
  location?: string;
  pronouns?: string;
  stage: CandidateStage;
  lastActivity: string;
  lastActivityAt: string;
  portalStatus?: PortalAccessStatus;
  /** Synced from Ashby, the system of record, or added in TalentBridge. */
  origin?: "ashby" | "talent_bridge";
  /** Where the application came from, e.g. "Referral" or "Ashby Simulator / Demo Careers". */
  source?: string;
  /** What they've heard from us: the SLA rules' view of this application. */
  communication: CommunicationSummary;
  /** The recruiter has turned on messaging, so the candidate can write to the hiring team about it. */
  candidateMessagingEnabled: boolean;
  nextStep?: { title: string; date: string };
  /** When their latest interview took place, if they've had one. */
  lastInterviewAt?: string;
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
  | "offer"
  | "ai";

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
  /** A recruiter's message sent from TalentBridge: portal always, email when configured. */
  delivery?: MessageDelivery;
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
  /** Ashby's own view of the application, when it was synced from Ashby. */
  ashby?: { stageTitle: string | null; status: string | null } | null;
  /** What they've heard from us and what they're waiting for. */
  communication?: CommunicationHealth;
};

export type PortalAccess = {
  status: PortalAccessStatus;
  invitedAt: string | null;
  activatedAt: string | null;
  /** A safe summary when an invitation failed or is waiting. */
  problem: string | null;
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

export type CurrentUser = {
  id: string;
  name: string;
  title: string;
  email: string;
  organization: string;
  /** From the API's users table, never from the browser or the token. Decides where they land. */
  role: Role;
  /** The candidate's own record, for candidates only. */
  candidateId: string | null;
  avatarUrl?: string;
};

export type NewCandidateInput = {
  firstName: string;
  lastName: string;
  email: string;
  jobId: string;
  location: string;
  stage: CandidateStage;
};

export type NewInterviewInput = {
  title: string;
  format: InterviewFormat;
  /** ISO timestamp. */
  scheduledAt: string;
  durationMinutes: number;
  interviewers: string[];
  meetingUrl?: string;
};
