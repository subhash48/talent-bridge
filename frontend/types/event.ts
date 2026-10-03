// Mirrors backend/app/schemas/event.py; keep EventType in the same order (ARCHITECTURE.md 9.2).
export type EventType =
  | "candidate_portal_opened"
  | "job_viewed"
  | "company_page_viewed"
  | "team_page_viewed"
  | "resource_viewed"
  | "interview_prep_viewed"
  | "offer_viewed"
  | "interview_confirmed"
  | "interview_reschedule_requested"
  | "message_received"
  | "message_sent"
  | "ai_question_asked"
  | "document_uploaded"
  | "assessment_completed"
  | "application_stage_changed"
  | "interview_scheduled"
  | "interview_completed"
  | "engagement_changed"
  | "follow_up_recommended"
  | "ai_draft_generated";

// The only types POST /v1/events accepts (ARCHITECTURE.md 9.3).
export const CLIENT_EVENT_TYPES = [
  "candidate_portal_opened",
  "job_viewed",
  "company_page_viewed",
  "team_page_viewed",
  "resource_viewed",
  "interview_prep_viewed",
  "offer_viewed",
] as const satisfies readonly EventType[];

export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];

export type EventSource = "candidate_portal" | "recruiter_dashboard" | "system" | "ai";

export type EngagementLevel = "high" | "medium" | "low" | "insufficient";

export const ENGAGEMENT_LABELS: Record<EngagementLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  insufficient: "Not enough signal",
};

export type EngagementSignal = {
  key: string;
  label: string;
  polarity: "positive" | "neutral" | "negative";
  observed_at: string | null;
};

export type ActivityEvent = {
  id: string;
  application_id: string | null;
  event_type: EventType;
  source: EventSource;
  label: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
};
