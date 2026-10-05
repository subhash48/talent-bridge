import type { DemographicAnswers } from "@/lib/demographics";
import { apiFetch } from "@/services/api";
import type {
  ApiCandidateApplicationDetail,
  ApiCandidateMe,
  ApiCandidatePrep,
  ApiMessageThread,
  ApiPortalActivity,
  ApiPortalApplication,
  ApiPortalApplicationSummary,
  ApiPortalCandidate,
  ApiPortalCompany,
  ApiPortalInterview,
  ApiPortalJob,
  ApiPortalMessage,
} from "@/types/api";
import type {
  ActivityKind,
  CandidateActivity,
  CandidateApplication,
  CandidateApplicationDetail,
  CandidateApplicationSummary,
  CandidateCompany,
  CandidateInterview,
  CandidateMeResponse,
  CandidateMessage,
  CandidateMessageThread,
  CandidatePrep,
  CandidateProfile,
  MessageKind,
  PortalJob,
  ProfileUpdateInput,
} from "@/types/portal";

// The Candidate Portal's API (/candidate/*). There is no candidate id anywhere in these calls: the
// server resolves who is signed in from their access token, and every response is a candidate-safe
// projection of the records the recruiter workspace uses.
//
// A candidate can have several applications. Calls about one take its id (the selected application);
// the API checks it is the candidate's own, and without one uses their latest active application.

/** "?application_id=..." when an application is given, else "". */
function forApplication(applicationId?: string | null, extra?: Record<string, string>): string {
  const params = new URLSearchParams(extra);
  if (applicationId) params.set("application_id", applicationId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** GET /candidate/me: the portal home, navigation badges and notifications, for one application. */
export async function getCandidateMe(applicationId?: string | null): Promise<CandidateMeResponse> {
  const me = await apiFetch<ApiCandidateMe>(`/candidate/me${forApplication(applicationId)}`);
  return {
    company: me.company,
    candidate: fromCandidate(me.candidate),
    applications: me.applications.map(fromSummary),
    application: me.application && fromApplication(me.application),
    job: me.job && fromJob(me.job),
    recruiter: me.recruiter,
    nextInterview: me.next_interview && fromInterview(me.next_interview),
    unreadMessages: me.unread_messages,
    latestMessage: me.latest_message && fromMessage(me.latest_message),
    recentActivity: me.recent_activity.map(fromActivity),
  };
}

/** GET /candidate/applications: every application, active first. */
export async function getCandidateApplications(): Promise<CandidateApplicationSummary[]> {
  return (await apiFetch<ApiPortalApplicationSummary[]>("/candidate/applications")).map(fromSummary);
}

/** One application in full. A 404 means it isn't one of the candidate's. */
export async function getCandidateApplication(applicationId?: string | null): Promise<CandidateApplicationDetail> {
  const path = applicationId ? `/candidate/applications/${encodeURIComponent(applicationId)}` : "/candidate/application";
  const detail = await apiFetch<ApiCandidateApplicationDetail>(path);
  return {
    application: fromApplication(detail.application),
    job: fromJob(detail.job),
    recruiter: detail.recruiter,
    timeline: detail.timeline.map(fromActivity),
  };
}

export async function getCandidateInterviews(applicationId?: string | null): Promise<CandidateInterview[]> {
  return (await apiFetch<ApiPortalInterview[]>(`/candidate/interviews${forApplication(applicationId)}`)).map(fromInterview);
}

/** PATCH /candidate/interviews/{id}/confirm. The recruiter sees the confirmation straight away. */
export async function confirmInterview(interviewId: string): Promise<CandidateInterview> {
  return fromInterview(await apiFetch<ApiPortalInterview>(`/candidate/interviews/${interviewId}/confirm`, { method: "PATCH" }));
}

export async function getMessageThread(applicationId?: string | null): Promise<CandidateMessageThread> {
  const thread = await apiFetch<ApiMessageThread>(`/candidate/messages${forApplication(applicationId)}`);
  return { recruiter: thread.recruiter, unread: thread.unread, messages: thread.messages.map(fromMessage) };
}

/** POST /candidate/messages. It arrives unread in the recruiter's inbox, labelled with the kind chosen. */
export async function sendCandidateMessage(
  body: string,
  { kind = "message", applicationId }: { kind?: MessageKind; applicationId?: string | null } = {},
): Promise<CandidateMessage> {
  const message = await apiFetch<ApiPortalMessage>("/candidate/messages", {
    method: "POST",
    body: JSON.stringify({ content: body, kind, application_id: applicationId ?? null }),
  });
  return fromMessage(message);
}

export async function markMessagesRead(applicationId?: string | null): Promise<void> {
  await apiFetch<void>(`/candidate/messages/read${forApplication(applicationId)}`, { method: "POST" });
}

export async function getCandidateProfile(): Promise<CandidateProfile> {
  return fromCandidate(await apiFetch<ApiPortalCandidate>("/candidate/profile"));
}

export async function updateCandidateProfile(input: ProfileUpdateInput): Promise<CandidateProfile> {
  const profile = await apiFetch<ApiPortalCandidate>("/candidate/profile", { method: "PATCH", body: JSON.stringify(input) });
  return fromCandidate(profile);
}

/** GET /candidate/demographics: the candidate's own voluntary answers. Only they can read them. */
export async function getCandidateDemographics(): Promise<DemographicAnswers> {
  const { region, race_ethnicity, disability_status, sexual_orientation } = await apiFetch<DemographicAnswers>("/candidate/demographics");
  return { region, race_ethnicity, disability_status, sexual_orientation };
}

/** PUT /candidate/demographics: replaces the answers; a blank question stays unanswered. */
export async function saveCandidateDemographics(answers: DemographicAnswers): Promise<DemographicAnswers> {
  const saved = await apiFetch<DemographicAnswers>("/candidate/demographics", { method: "PUT", body: JSON.stringify(answers) });
  return {
    region: saved.region,
    race_ethnicity: saved.race_ethnicity,
    disability_status: saved.disability_status,
    sexual_orientation: saved.sexual_orientation,
  };
}

/** GET /candidate/company: the company-approved profile the Company page shows and the assistant answers from. */
export async function getCandidateCompany(): Promise<CandidateCompany> {
  const company = await apiFetch<ApiPortalCompany>("/candidate/company");
  return {
    name: company.name,
    overview: company.overview,
    mission: company.mission,
    highlights: company.highlights,
    products: company.products,
    values: company.values,
    benefits: company.benefits,
    benefitsNote: company.benefits_note,
    locations: company.locations,
    locationsNote: company.locations_note,
    hiringProcess: company.hiring_process,
    hiringNote: company.hiring_note,
    links: company.links,
    source: company.source,
  };
}

/** GET /candidate/prep: AI interview prep built from candidate-safe context only. */
export async function getCandidatePrep(applicationId?: string | null, signal?: AbortSignal): Promise<CandidatePrep> {
  const query = forApplication(applicationId, { utc_offset_minutes: String(utcOffsetMinutes()) });
  const prep = await apiFetch<ApiCandidatePrep>(`/candidate/prep${query}`, { signal });
  return {
    interview: prep.interview && fromInterview(prep.interview),
    role: prep.role,
    company: prep.company,
    interviewFormat: prep.interview_format,
    whatToExpect: prep.what_to_expect,
    roleFocus: prep.role_focus,
    topicsToReview: prep.topics_to_review,
    companyInfo: prep.company_info,
    questionsToAsk: prep.questions_to_ask,
    practiceQuestions: prep.practice_questions,
    modelName: prep.model_name,
  };
}

/** Tells the recruiter the candidate opened their prep (once an hour at most, server-side). */
export async function recordPrepViewed(applicationId?: string | null): Promise<void> {
  await apiFetch<void>(`/candidate/prep/viewed${forApplication(applicationId)}`, { method: "POST", keepalive: true });
}

/** POST /candidate/ai/ask. The recruiter's timeline records the topic, never the question. */
export async function askCandidateAssistant(message: string, applicationId?: string | null, signal?: AbortSignal): Promise<string> {
  const { answer } = await apiFetch<{ answer: string; model_name: string }>("/candidate/ai/ask", {
    method: "POST",
    body: JSON.stringify({ message, utc_offset_minutes: utcOffsetMinutes(), application_id: applicationId ?? null }),
    signal,
  });
  return answer;
}

/** Minutes ahead of UTC in the browser, so the assistant can say "tomorrow at 10:00" in local time. */
function utcOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

const KINDS: readonly ActivityKind[] = ["application", "stage", "interview", "message", "prep", "question", "document", "offer", "profile"];

function fromActivity(activity: ApiPortalActivity): CandidateActivity {
  const kind = (KINDS as readonly string[]).includes(activity.kind) ? (activity.kind as ActivityKind) : "application";
  return { id: activity.id, kind, title: activity.title, occurredAt: activity.created_at };
}

function fromCandidate(candidate: ApiPortalCandidate): CandidateProfile {
  return {
    id: candidate.id,
    firstName: candidate.first_name,
    lastName: candidate.last_name,
    fullName: candidate.full_name,
    email: candidate.email,
    phone: candidate.phone,
    location: candidate.location,
    headline: candidate.headline,
    pronouns: candidate.pronouns,
    avatarUrl: candidate.avatar_url,
    resumeUrl: candidate.resume_url,
    skills: candidate.skills,
  };
}

function fromSummary(summary: ApiPortalApplicationSummary): CandidateApplicationSummary {
  return {
    id: summary.id,
    jobTitle: summary.job_title,
    company: summary.company,
    department: summary.department,
    location: summary.location,
    stage: summary.stage,
    stageLabel: summary.stage_label,
    status: summary.status,
    appliedAt: summary.applied_at,
    updatedAt: summary.updated_at,
    nextInterviewAt: summary.next_interview_at,
    unreadMessages: summary.unread_messages,
    withdrawn: summary.withdrawn,
  };
}

function fromApplication(application: ApiPortalApplication): CandidateApplication {
  return {
    id: application.id,
    stage: application.stage,
    stageLabel: application.stage_label,
    status: application.status,
    appliedAt: application.applied_at,
    updatedAt: application.updated_at,
    steps: application.steps.map((step) => ({ stage: step.stage, label: step.label, state: step.state, reachedAt: step.reached_at })),
    nextStep: application.next_step,
  };
}

function fromJob(job: ApiPortalJob): PortalJob {
  const description = job.description ?? "";
  const requirements = /^\s*requirements\s*:\s*(.+)$/im.exec(description)?.[1] ?? "";
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    department: job.department,
    location: job.location,
    employmentType: job.employment_type,
    summary: description.split(/\n\s*\n/)[0]?.trim() ?? "",
    requirements: requirements
      .split(/[,;]/)
      .map((item) => item.trim().replace(/\.$/, ""))
      .filter(Boolean),
    hiringManager: job.hiring_manager,
  };
}

function fromInterview(interview: ApiPortalInterview): CandidateInterview {
  return {
    id: interview.id,
    title: interview.title,
    format: interview.interview_type,
    scheduledAt: interview.scheduled_at,
    durationMinutes: interview.duration_minutes,
    status: interview.status,
    meetingUrl: interview.meeting_url,
    interviewers: interview.interviewers,
    confirmedAt: interview.confirmed_at,
    upcoming: interview.upcoming,
    canConfirm: interview.can_confirm,
  };
}

function fromMessage(message: ApiPortalMessage): CandidateMessage {
  return {
    id: message.id,
    sender: message.sender_type,
    senderName: message.sender_name,
    body: message.content,
    kind: message.kind,
    sentAt: message.created_at,
    readAt: message.read_at,
  };
}
