import type { EngagementLevel, EngagementSignal } from "@/types/event";
import type { JobStatus } from "@/types/job";

// The FastAPI wire format (backend/app/schemas). services/* map these into the view models in
// types/workspace.ts, so components never depend on them directly.

export type ApiStage = "sourced" | "screening" | "interview" | "offer" | "hired" | "rejected";
export type ApiInterviewType = "video" | "phone" | "onsite";
export type ApiInterviewStatus = "scheduled" | "completed" | "cancelled";
export type ApiSenderType = "candidate" | "recruiter" | "system" | "ai";

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
  signals: EngagementSignal[];
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
  status: "active" | "hired" | "closed";
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
  created_at: string;
  read_at: string | null;
};

export type ApiPortalActivity = { id: string; kind: string; title: string; created_at: string };

export type ApiCandidateMe = {
  company: string;
  candidate: ApiPortalCandidate;
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
