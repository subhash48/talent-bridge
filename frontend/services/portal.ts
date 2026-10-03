import { apiFetch } from "@/services/api";
import type {
  ApiCandidateApplicationDetail,
  ApiCandidateMe,
  ApiCandidatePrep,
  ApiMessageThread,
  ApiPortalActivity,
  ApiPortalApplication,
  ApiPortalCandidate,
  ApiPortalInterview,
  ApiPortalJob,
  ApiPortalMessage,
} from "@/types/api";
import type {
  ActivityKind,
  CandidateActivity,
  CandidateApplication,
  CandidateApplicationDetail,
  CandidateInterview,
  CandidateMeResponse,
  CandidateMessage,
  CandidateMessageThread,
  CandidatePrep,
  CandidateProfile,
  PortalJob,
  ProfileUpdateInput,
} from "@/types/portal";

// The Candidate Portal's API (/candidate/*). There is no candidate id anywhere in these calls: the
// server resolves who is signed in (the dev candidate until Supabase Auth), and every response is
// a candidate-safe projection of the records the recruiter workspace uses.

/** GET /candidate/me: the portal home, navigation badges and notifications. */
export async function getCandidateMe(token?: string): Promise<CandidateMeResponse> {
  const me = await apiFetch<ApiCandidateMe>("/candidate/me", { token });
  return {
    company: me.company,
    candidate: fromCandidate(me.candidate),
    application: me.application && fromApplication(me.application),
    job: me.job && fromJob(me.job),
    recruiter: me.recruiter,
    nextInterview: me.next_interview && fromInterview(me.next_interview),
    unreadMessages: me.unread_messages,
    latestMessage: me.latest_message && fromMessage(me.latest_message),
    recentActivity: me.recent_activity.map(fromActivity),
  };
}

export async function getCandidateApplication(token?: string): Promise<CandidateApplicationDetail> {
  const detail = await apiFetch<ApiCandidateApplicationDetail>("/candidate/application", { token });
  return {
    application: fromApplication(detail.application),
    job: fromJob(detail.job),
    recruiter: detail.recruiter,
    timeline: detail.timeline.map(fromActivity),
  };
}

export async function getCandidateInterviews(token?: string): Promise<CandidateInterview[]> {
  return (await apiFetch<ApiPortalInterview[]>("/candidate/interviews", { token })).map(fromInterview);
}

/** PATCH /candidate/interviews/{id}/confirm. The recruiter sees the confirmation straight away. */
export async function confirmInterview(interviewId: string, token?: string): Promise<CandidateInterview> {
  return fromInterview(await apiFetch<ApiPortalInterview>(`/candidate/interviews/${interviewId}/confirm`, { token, method: "PATCH" }));
}

export async function getMessageThread(token?: string): Promise<CandidateMessageThread> {
  const thread = await apiFetch<ApiMessageThread>("/candidate/messages", { token });
  return { recruiter: thread.recruiter, unread: thread.unread, messages: thread.messages.map(fromMessage) };
}

/** POST /candidate/messages. It arrives unread in the recruiter's inbox. */
export async function sendCandidateMessage(body: string, token?: string): Promise<CandidateMessage> {
  const message = await apiFetch<ApiPortalMessage>("/candidate/messages", {
    token,
    method: "POST",
    body: JSON.stringify({ content: body }),
  });
  return fromMessage(message);
}

export async function markMessagesRead(token?: string): Promise<void> {
  await apiFetch<void>("/candidate/messages/read", { token, method: "POST" });
}

export async function getCandidateProfile(token?: string): Promise<CandidateProfile> {
  return fromCandidate(await apiFetch<ApiPortalCandidate>("/candidate/profile", { token }));
}

export async function updateCandidateProfile(input: ProfileUpdateInput, token?: string): Promise<CandidateProfile> {
  const profile = await apiFetch<ApiPortalCandidate>("/candidate/profile", { token, method: "PATCH", body: JSON.stringify(input) });
  return fromCandidate(profile);
}

/** GET /candidate/prep: AI interview prep built from candidate-safe context only. */
export async function getCandidatePrep(signal?: AbortSignal, token?: string): Promise<CandidatePrep> {
  const prep = await apiFetch<ApiCandidatePrep>(`/candidate/prep?utc_offset_minutes=${utcOffsetMinutes()}`, { token, signal });
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
export async function recordPrepViewed(token?: string): Promise<void> {
  await apiFetch<void>("/candidate/prep/viewed", { token, method: "POST", keepalive: true });
}

/** POST /candidate/ai/ask. The recruiter's timeline records the topic, never the question. */
export async function askCandidateAssistant(message: string, signal?: AbortSignal, token?: string): Promise<string> {
  const { answer } = await apiFetch<{ answer: string; model_name: string }>("/candidate/ai/ask", {
    token,
    method: "POST",
    body: JSON.stringify({ message, utc_offset_minutes: utcOffsetMinutes() }),
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
    sentAt: message.created_at,
    readAt: message.read_at,
  };
}
