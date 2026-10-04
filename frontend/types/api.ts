import type { EngagementLevel } from "@/types/event";
import type { JobStatus } from "@/types/job";

// The FastAPI wire format (backend/app/schemas). services/* map these into the view models in
// types/workspace.ts, so components never depend on them directly.

export type ApiStage = "sourced" | "screening" | "interview" | "offer" | "hired" | "rejected";
export type ApiInterviewType = "video" | "phone" | "onsite";
export type ApiInterviewStatus = "scheduled" | "completed" | "cancelled";
export type ApiSenderType = "candidate" | "recruiter" | "system" | "ai";
/** The candidate's own label for a message, chosen in the portal (never inferred from its text). */
export type ApiMessageKind = "message" | "thank_you" | "follow_up" | "question";
export type ApiPortalAccountStatus = "not_required" | "pending_invitation" | "invited" | "active" | "invite_failed";
/** Synced from Ashby (the system of record) or created in Talent Bridge. */
export type ApiOrigin = "ashby" | "talent_bridge";

export type ApiPage<T> = { items: T[]; total: number; limit: number; offset: number };

export type ApiCandidate = {
  id: string;
  external_id: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  avatar_url: string | null;
  headline: string | null;
  resume_url: string | null;
  pronouns: string | null;
  skills: string[];
  portal_status: ApiPortalAccountStatus;
  created_at: string;
  updated_at: string;
};

export type ApiJobBrief = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  status: JobStatus;
};

export type ApiJob = ApiJobBrief & {
  external_id: string | null;
  description: string | null;
  employment_type: string;
  hiring_manager: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiActivityBrief = { id: string; activity_type: string; title: string; created_at: string };

export type ApiActivity = ApiActivityBrief & {
  application_id: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
};

export type ApiEngagement = {
  level: EngagementLevel;
  /** 0-100, or null while there's too little data. Never a measure of candidate quality. */
  score: number | null;
  label: string;
  last_active_at: string | null;
  follow_up_reason: string | null;
};

export type ApiInterviewBrief = {
  id: string;
  title: string;
  interview_type: ApiInterviewType;
  scheduled_at: string;
  duration_minutes: number;
  status: ApiInterviewStatus;
};

export type ApiInterview = ApiInterviewBrief & {
  application_id: string;
  meeting_url: string | null;
  notes: string | null;
  interviewers: string[];
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiCandidateRef = {
  application_id: string;
  candidate_id: string;
  full_name: string;
  avatar_url: string | null;
  job_title: string;
};

export type ApiInterviewListItem = ApiInterview & { candidate: ApiCandidateRef };

export type ApiCandidateListItem = {
  application_id: string;
  candidate: ApiCandidate;
  job: ApiJobBrief;
  stage: ApiStage;
  source: string | null;
  origin: ApiOrigin;
  applied_at: string;
  updated_at: string;
  archived_at: string | null;
  last_activity: ApiActivityBrief | null;
  engagement: ApiEngagement;
  next_interview: ApiInterviewBrief | null;
};

export type ApiMessage = {
  id: string;
  application_id: string;
  sender_type: ApiSenderType;
  content: string;
  kind: ApiMessageKind;
  created_at: string;
  read_at: string | null;
};

export type ApiConversation = { candidate: ApiCandidateRef; unread: number; messages: ApiMessage[] };

export type ApiAnalysis = {
  id: string;
  application_id: string;
  summary: string;
  skills_matched: { skill: string; evidence: string }[];
  missing_skills: string[];
  strengths: string[];
  concerns: string[];
  suggested_questions: string[];
  recommended_next_step: string;
  model_name: string | null;
  created_at: string;
};

export type ApiApplication = {
  id: string;
  candidate_id: string;
  job_id: string;
  stage: ApiStage;
  source: string | null;
  applied_at: string;
  updated_at: string;
  archived_at: string | null;
  external_id: string | null;
  external_status: string | null;
  /** Ashby's own name for the stage, e.g. "Hiring Manager Screen". */
  external_stage_title: string | null;
  origin: ApiOrigin;
};

export type ApiCandidateDetail = {
  candidate: ApiCandidate;
  application: ApiApplication | null;
  job: ApiJob | null;
  stage: ApiStage | null;
  engagement: ApiEngagement | null;
  next_interview: ApiInterview | null;
  activity: ApiActivity[];
  interviews: ApiInterview[];
  messages: ApiMessage[];
  ai_analysis: ApiAnalysis | null;
};

export type ApiUser = {
  id: string;
  email: string;
  full_name: string;
  role: "recruiter" | "candidate" | "admin";
  organization: string;
  candidate_id: string | null;
  created_at: string;
};

export type ApiAskResponse = { answer: string; sources: { type: string; id: string; label: string }[]; model_name: string };

export type ApiDraftPurpose = "follow_up" | "outreach" | "interview_confirmation" | "status_update" | "offer_check_in";

export type ApiDraft = { subject: string; body: string; purpose: ApiDraftPurpose; model_name: string };

// Candidate portal (/candidate/*): candidate-safe projections, mapped by services/portal.ts.

export type ApiPortalCandidate = {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  headline: string | null;
  pronouns: string | null;
  avatar_url: string | null;
  resume_url: string | null;
  skills: string[];
};

export type ApiPortalJob = {
  id: string;
  title: string;
  company: string;
  department: string | null;
  location: string | null;
  employment_type: string;
  description: string | null;
  hiring_manager: string | null;
};

export type ApiPortalRecruiter = { name: string; email: string; title: string };

export type ApiPortalApplication = {
  id: string;
  stage: ApiStage;
  stage_label: string;
  status: ApiApplicationBucket;
  applied_at: string;
  updated_at: string;
  steps: { stage: ApiStage; label: string; state: "complete" | "current" | "upcoming"; reached_at: string | null }[];
  next_step: string;
};

export type ApiPortalInterview = ApiInterviewBrief & {
  meeting_url: string | null;
  interviewers: string[];
  confirmed_at: string | null;
  upcoming: boolean;
  can_confirm: boolean;
};

export type ApiPortalMessage = {
  id: string;
  sender_type: "candidate" | "recruiter" | "system";
  sender_name: string;
  content: string;
  kind: ApiMessageKind;
  created_at: string;
  read_at: string | null;
};

export type ApiPortalActivity = { id: string; kind: string; title: string; created_at: string };

export type ApiApplicationBucket = "active" | "inactive" | "no_longer_considered";

export type ApiPortalApplicationSummary = {
  id: string;
  job_title: string;
  company: string;
  department: string | null;
  location: string | null;
  stage: ApiStage;
  stage_label: string;
  status: ApiApplicationBucket;
  applied_at: string;
  updated_at: string;
  next_interview_at: string | null;
  unread_messages: number;
  withdrawn: boolean;
};

export type ApiPortalCompanyItem = { title: string; description: string };

/** GET /candidate/company (backend services/company_profile.py). */
export type ApiPortalCompany = {
  name: string;
  overview: string;
  mission: string;
  highlights: ApiPortalCompanyItem[];
  products: ApiPortalCompanyItem[];
  values: ApiPortalCompanyItem[];
  benefits: string[];
  benefits_note: string;
  locations: string[];
  locations_note: string;
  hiring_process: string[];
  hiring_note: string;
  links: { label: string; url: string }[];
  source: string;
};

export type ApiCandidateMe = {
  company: string;
  candidate: ApiPortalCandidate;
  applications: ApiPortalApplicationSummary[];
  application: ApiPortalApplication | null;
  job: ApiPortalJob | null;
  recruiter: ApiPortalRecruiter | null;
  next_interview: ApiPortalInterview | null;
  unread_messages: number;
  latest_message: ApiPortalMessage | null;
  recent_activity: ApiPortalActivity[];
};

export type ApiCandidateApplicationDetail = {
  application: ApiPortalApplication;
  job: ApiPortalJob;
  recruiter: ApiPortalRecruiter | null;
  timeline: ApiPortalActivity[];
};

export type ApiMessageThread = { recruiter: ApiPortalRecruiter | null; unread: number; messages: ApiPortalMessage[] };

export type ApiCandidatePrep = {
  interview: ApiPortalInterview | null;
  role: string;
  company: string;
  interview_format: string;
  what_to_expect: string[];
  role_focus: string[];
  topics_to_review: string[];
  company_info: string[];
  questions_to_ask: string[];
  practice_questions: string[];
  model_name: string;
};

// Candidate engagement (GET /candidates/{id}/engagement): recruiter-only, informational. It never
// ranks, advances or rejects anyone, and nothing in the candidate portal can read it.

export type ApiPortalAccess = {
  status: ApiPortalAccountStatus;
  invited_at: string | null;
  activated_at: string | null;
  problem: string | null;
};

export type ApiEngagementBreakdown = {
  candidate_id: string;
  application_id: string | null;
  score: number | null;
  label: string;
  level: EngagementLevel;
  sufficient_data: boolean;
  portal_activity: {
    score: number;
    max: number;
    neutral: boolean;
    sessions: number;
    active_minutes: number;
    meaningful_views: number;
    last_active_at: string | null;
  };
  responsiveness: {
    score: number;
    max: number;
    neutral: boolean;
    response_opportunities: number;
    responses: number;
    pending: number;
    median_response_minutes: number | null;
    last_response_minutes: number | null;
  };
  communication: {
    score: number;
    max: number;
    initiated_messages: number;
    confirmations: number;
    confirmation_opportunities: number;
    thank_you_notes: number;
    follow_ups: number;
  };
  proactive_actions: number;
  overall: { visits: number; active_minutes: number; last_active_at: string | null };
  portal_access: ApiPortalAccess;
  recent_portal_activity: { label: string; occurred_at: string; count: number }[];
  formula_version: string;
  note: string;
};

// Ashby integration health (GET /integrations/ashby/status). Never carries a key or a payload.
export type ApiAshbyStatus = {
  status: "connected" | "disconnected" | "error";
  api_key_configured: boolean;
  webhook_secret_configured: boolean;
  portal_invites_configured: boolean;
  last_webhook_at: string | null;
  last_webhook_action: string | null;
  webhooks_failed_last_7_days: number;
  last_successful_sync_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  invitations_pending: number;
  invitations_failed: number;
};
