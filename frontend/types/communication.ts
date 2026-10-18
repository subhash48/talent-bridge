import type { ApplicationStage } from "@/types/application";

// Candidate communication: who needs an update, what they've heard, and the drafts a recruiter
// edits and approves. services/communication.ts maps the API into these shapes.

export const COMMUNICATION_RULES = [
  "stage_update",
  "unanswered_question",
  "post_interview",
  "interview_unconfirmed",
  "no_recent_update",
] as const;

export type CommunicationRule = (typeof COMMUNICATION_RULES)[number];
export type CommunicationStatus = "needs_attention" | "due_soon" | "on_track" | "closed";
export type DraftReason = CommunicationRule | "manual";
export type EmailStatus = "pending" | "sent" | "failed" | "not_configured";

/** One rule whose threshold has passed. */
export type AttentionReason = {
  rule: CommunicationRule;
  title: string;
  detail: string;
  /** When the clock started: the stage change, their message, the interview's end... */
  since: string;
  dueAt: string;
  interviewId?: string;
  messageId?: string;
};

/** A pipeline row's communication column. */
export type CommunicationSummary = {
  status: CommunicationStatus;
  lastUpdateAt?: string;
  daysSinceUpdate: number;
  reason?: string;
};

/** What one candidate has heard from us and what they're waiting for. Recruiter-only. */
export type CommunicationHealth = {
  status: CommunicationStatus;
  /** The status the candidate sees in their portal. */
  candidateStatus: string;
  lastUpdateAt?: string;
  waitingSince: string;
  daysSinceUpdate: number;
  openQuestion?: { messageId: string; askedAt: string; excerpt: string; count: number };
  nextInterview?: { interviewId: string; title: string; scheduledAt: string; confirmed: boolean };
  lastInterview?: { interviewId: string; title: string; endedAt: string; followedUp: boolean };
  stageChange?: { stage: ApplicationStage; changedAt: string; told: boolean };
  attention: AttentionReason[];
  nextDueAt?: string;
};

/** An update the AI drafted. Never sent until a recruiter sends it. */
export type UpdateDraft = {
  id: string;
  applicationId: string;
  reason: DraftReason;
  status: "drafted" | "sent" | "discarded";
  subject: string;
  body: string;
  /** The recruiter changed what the AI wrote. */
  edited: boolean;
  modelName?: string;
  createdAt: string;
};

export type AttentionItem = {
  applicationId: string;
  candidateId: string;
  name: string;
  role: string;
  avatarUrl?: string;
  stage: ApplicationStage;
  candidateStatus: string;
  lastUpdateAt?: string;
  daysSinceUpdate: number;
  reasons: AttentionReason[];
  draft?: UpdateDraft;
};

export type AttentionList = {
  items: AttentionItem[];
  counts: Partial<Record<CommunicationRule, number>>;
  /** Applications whose next rule is due within a day. */
  upcoming: number;
};

/** How a recruiter's message reached the candidate: always the portal, and email when configured. */
export type MessageDelivery = {
  subject: string;
  emailStatus: EmailStatus;
  error?: string;
  sentAt?: string;
};

export type CommunicationRuleSetting = {
  key: CommunicationRule;
  title: string;
  description: string;
  /** What thresholdHours counts, e.g. "hours after the interview ended". */
  unit: string;
  enabled: boolean;
  thresholdHours: number;
  defaultHours: number;
};

export type EmailDeliveryStatus = { configured: boolean; provider?: string; sender?: string };

export type RuleCompliance = { rule: CommunicationRule; title: string; met: number; total: number };

export type CommunicationAnalytics = {
  days: number;
  needsAttention: number;
  unansweredMessages: number;
  medianHoursBetweenUpdates: number | null;
  /** Share of obligations met on time, 0 to 1. */
  slaCompliance: number | null;
  compliance: RuleCompliance[];
  interviewConfirmationRate: number | null;
  interviewsConfirmed: number;
  interviewsTotal: number;
  updatesSent: number;
  emailsSent: number;
  emailsFailed: number;
  draftsGenerated: number;
  draftsSent: number;
  draftsSentUnedited: number;
  draftsDiscarded: number;
  /** An estimate: minutesSavedPerDraft for each AI draft a recruiter sent. */
  minutesSaved: number;
  minutesSavedPerDraft: number;
};
