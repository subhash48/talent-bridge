import type { ApiInterviewStatus, ApiMessageKind, ApiStage } from "@/types/api";
import type { InterviewFormat } from "@/types/workspace";

// View models for the Candidate Portal. services/portal.ts maps the /candidate API (backend
// app/schemas/portal.py) into these. Every field is something the candidate may see: interviewer
// feedback, engagement and internal notes don't exist in these types.

export type StepState = "complete" | "current" | "upcoming";
/** Where an application sits for the candidate. The real stage is kept separately. */
export type ApplicationStatus = "active" | "inactive" | "no_longer_considered";
export type MessageKind = ApiMessageKind;
export type ActivityKind = "application" | "stage" | "interview" | "message" | "prep" | "question" | "document" | "offer" | "profile";

export type CandidateProfile = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  location: string | null;
  headline: string | null;
  pronouns: string | null;
  avatarUrl: string | null;
  resumeUrl: string | null;
  skills: string[];
};

export type PortalJob = {
  id: string;
  title: string;
  company: string;
  department: string | null;
  location: string | null;
  employmentType: string;
  /** The posting's first paragraph. */
  summary: string;
  /** From the posting's "Requirements:" line. */
  requirements: string[];
  hiringManager: string | null;
};

export type PortalRecruiter = { name: string; email: string; title: string };

export type ApplicationStep = {
  stage: ApiStage;
  label: string;
  state: StepState;
  reachedAt: string | null;
};

export type CandidateApplication = {
  id: string;
  stage: ApiStage;
  /** "Interview", "Withdrawn", "No longer under consideration"... */
  stageLabel: string;
  status: ApplicationStatus;
  appliedAt: string;
  updatedAt: string;
  steps: ApplicationStep[];
  nextStep: string;
};

export type CandidateInterview = {
  id: string;
  title: string;
  format: InterviewFormat;
  scheduledAt: string;
  durationMinutes: number;
  status: ApiInterviewStatus;
  /** Only while the interview is upcoming. */
  meetingUrl: string | null;
  interviewers: string[];
  confirmedAt: string | null;
  /** Scheduled and not over yet. */
  upcoming: boolean;
  canConfirm: boolean;
};

export type MessageSender = "candidate" | "recruiter" | "system";

export type CandidateMessage = {
  id: string;
  sender: MessageSender;
  senderName: string;
  body: string;
  kind: MessageKind;
  sentAt: string;
  readAt: string | null;
};

export type CandidateActivity = {
  id: string;
  kind: ActivityKind;
  title: string;
  occurredAt: string;
};

/** One of the candidate's applications, for the list grouped by status. */
export type CandidateApplicationSummary = {
  id: string;
  jobTitle: string;
  company: string;
  department: string | null;
  location: string | null;
  stage: ApiStage;
  stageLabel: string;
  status: ApplicationStatus;
  appliedAt: string;
  updatedAt: string;
  nextInterviewAt: string | null;
  unreadMessages: number;
};

export type CandidateMeResponse = {
  company: string;
  candidate: CandidateProfile;
  /** Every application, active first. */
  applications: CandidateApplicationSummary[];
  /** The one the portal is showing (the selected application). */
  application: CandidateApplication | null;
  job: PortalJob | null;
  recruiter: PortalRecruiter | null;
  nextInterview: CandidateInterview | null;
  unreadMessages: number;
  /** The latest message from the hiring team. */
  latestMessage: CandidateMessage | null;
  /** Newest first. */
  recentActivity: CandidateActivity[];
};

export type CandidateApplicationDetail = {
  application: CandidateApplication;
  job: PortalJob;
  recruiter: PortalRecruiter | null;
  /** Oldest first. */
  timeline: CandidateActivity[];
};

export type CandidateMessageThread = {
  recruiter: PortalRecruiter | null;
  unread: number;
  /** Oldest first. */
  messages: CandidateMessage[];
};

export type CandidatePrep = {
  interview: CandidateInterview | null;
  role: string;
  company: string;
  interviewFormat: string;
  whatToExpect: string[];
  roleFocus: string[];
  topicsToReview: string[];
  /** Company-approved facts only. */
  companyInfo: string[];
  questionsToAsk: string[];
  practiceQuestions: string[];
  modelName: string;
};

/** The only fields a candidate can change. */
export type ProfileUpdateInput = {
  phone?: string | null;
  location?: string | null;
  headline?: string | null;
  skills?: string[];
};
