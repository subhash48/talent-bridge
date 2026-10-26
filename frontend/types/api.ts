import type { CommunicationRule, CommunicationStatus, DraftReason, EmailStatus } from "@/types/communication";
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
/** Synced from Ashby (the system of record) or created in TalentBridge. */
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
  /** The employer: two companies can have a job with the same title. */
  company_name: string;
  stage: ApiStage;
  source: string | null;
  origin: ApiOrigin;
  applied_at: string;
  updated_at: string;
  archived_at: string | null;
  candidate_messaging_enabled: boolean;
  last_activity: ApiActivityBrief | null;
  communication: ApiCommunicationSummary;
  next_interview: ApiInterviewBrief | null;
  /** The latest interview that took place; cancelled ones are left out. */
  last_interview_at: string | null;
};

export type ApiMessage = {
  id: string;
  application_id: string;
  sender_type: ApiSenderType;
  content: string;
  kind: ApiMessageKind;
  created_at: string;
  read_at: string | null;
  /** A recruiter's message sent from TalentBridge: how it reached the candidate. */
  delivery?: { subject: string; email_status: EmailStatus; error: string | null; sent_at: string | null } | null;
};

export type ApiConversation = { candidate: ApiCandidateRef; unread: number; messages: ApiMessage[] };

export type ApiApplication = {
  id: string;
  candidate_id: string;
  job_id: string;
  stage: ApiStage;
  source: string | null;
  applied_at: string;
  updated_at: string;
  archived_at: string | null;
  candidate_messaging_enabled: boolean;
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
  company_name: string | null;
  stage: ApiStage | null;
  communication: ApiCommunicationHealth | null;
  next_interview: ApiInterview | null;
  last_interview_at: string | null;
  activity: ApiActivity[];
  interviews: ApiInterview[];
  messages: ApiMessage[];
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
  /** The hiring team has turned on messaging, so the candidate can write to them about it. */
  messaging_enabled: boolean;
};

export type ApiPortalInterview = ApiInterviewBrief & {
  /** The application it belongs to. */
  application_id: string;
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
  company_logo_url: string | null;
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

/** The employer behind one of the candidate's applications (application -> job -> company). */
export type ApiPortalEmployer = { id: string; name: string; logo_url: string | null; website: string | null };

/** GET /candidate/company?application_id= (backend services/company_profile.py). */
export type ApiPortalCompany = ApiPortalEmployer & {
  /** The application it was read through. */
  application_id: string;
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
  /** The selected application's employer; null without an application. */
  company: ApiPortalEmployer | null;
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

export type ApiMessageThread = {
  recruiter: ApiPortalRecruiter | null;
  unread: number;
  messages: ApiPortalMessage[];
  can_message: boolean;
};

export type ApiCandidatePrep = {
  interview: ApiPortalInterview | null;
  /** The application it was prepared for (an interview decides it). */
  application_id: string;
  role: string;
  company: string;
  interview_format: string;
  what_to_expect: string[];
  role_focus: string[];
  topics_to_review: string[];
  company_info: string[];
  questions_to_ask: string[];
  practice_questions: string[];
  resume_talking_points: string[];
  model_name: string;
};

// Candidate portal access (POST /candidates/{id}/portal-invite): recruiter-only.
export type ApiPortalAccess = {
  status: ApiPortalAccountStatus;
  invited_at: string | null;
  activated_at: string | null;
  problem: string | null;
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

// Candidate communication (backend/app/schemas/communication.py)

export type ApiAttentionReason = {
  rule: CommunicationRule;
  title: string;
  detail: string;
  since: string;
  due_at: string;
  interview_id: string | null;
  message_id: string | null;
};

export type ApiCommunicationSummary = {
  status: CommunicationStatus;
  last_update_at: string | null;
  days_since_update: number;
  reason: string | null;
};

export type ApiCommunicationHealth = {
  status: CommunicationStatus;
  candidate_status: string;
  last_update_at: string | null;
  waiting_since: string;
  days_since_update: number;
  open_question: { message_id: string; asked_at: string; excerpt: string; count: number } | null;
  next_interview: { interview_id: string; title: string; scheduled_at: string; confirmed: boolean } | null;
  last_interview: { interview_id: string; title: string; ended_at: string; followed_up: boolean } | null;
  stage_change: { stage: ApiStage; changed_at: string; told: boolean } | null;
  attention: ApiAttentionReason[];
  next_due_at: string | null;
};

export type ApiUpdateDraft = {
  id: string;
  application_id: string;
  reason: DraftReason;
  status: "drafted" | "sent" | "discarded";
  subject: string;
  body: string;
  edited: boolean;
  model_name: string | null;
  message_id: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  discarded_at: string | null;
};

export type ApiDraftSent = { draft: ApiUpdateDraft; message: ApiMessage };

export type ApiAttentionList = {
  items: {
    candidate: ApiCandidateRef;
    stage: ApiStage;
    candidate_status: string;
    last_update_at: string | null;
    days_since_update: number;
    reasons: ApiAttentionReason[];
    draft: ApiUpdateDraft | null;
  }[];
  counts: Partial<Record<CommunicationRule, number>>;
  upcoming: number;
};

export type ApiCommunicationRule = {
  key: CommunicationRule;
  title: string;
  description: string;
  unit: string;
  enabled: boolean;
  threshold_hours: number;
  default_hours: number;
};

export type ApiEmailDelivery = { configured: boolean; provider: string | null; sender: string | null };

export type ApiCommunicationAnalytics = {
  days: number;
  since: string;
  needs_attention: number;
  unanswered_messages: number;
  median_hours_between_updates: number | null;
  sla_compliance: number | null;
  compliance: { rule: CommunicationRule; title: string; met: number; total: number }[];
  interview_confirmation_rate: number | null;
  interviews_confirmed: number;
  interviews_total: number;
  updates_sent: number;
  emails_sent: number;
  emails_failed: number;
  drafts_generated: number;
  drafts_sent: number;
  drafts_sent_unedited: number;
  drafts_discarded: number;
  minutes_saved: number;
  minutes_saved_per_draft: number;
};
