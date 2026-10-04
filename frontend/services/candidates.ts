import { USE_MOCK_API, apiFetch } from "@/services/api";
import { fromInterview } from "@/services/interviews";
import { fromMessage } from "@/services/messages";
import { mockApi } from "@/services/mock/api";
import type {
  ApiActivity,
  ApiAnalysis,
  ApiCandidateDetail,
  ApiCandidateListItem,
  ApiPage,
} from "@/types/api";
import {
  PIPELINE_STAGES,
  type ActivityKind,
  type CandidateActivity,
  type CandidateAnalysis,
  type CandidateDetail,
  type CandidateStage,
  type DashboardSummary,
  type NewCandidateInput,
  type PipelineCandidate,
  type ScheduledInterview,
} from "@/types/workspace";

// Candidates and their applications. A pipeline row is one application: one person applying to
// one job, so PipelineCandidate.id is the application id and candidateId is the person.

export type CandidateQuery = {
  stage?: CandidateStage;
  jobId?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
  if (USE_MOCK_API) return mockApi.getDashboardSummary();
  const { trends } = await apiFetch<{ trends: { total: number | null; interviews: number | null; follow_up: number | null; offers: number | null } }>("/dashboard/summary");
  return { trends: { total: trends.total, interviews: trends.interviews, followUp: trends.follow_up, offers: trends.offers } };
}

/** GET /candidates: the pipeline, most recent activity first, filtered on the server. */
export async function getCandidates(query: CandidateQuery = {}): Promise<PipelineCandidate[]> {
  if (USE_MOCK_API) return mockApi.getCandidates(query);
  const params = new URLSearchParams({ limit: String(query.limit ?? 200) });
  if (query.stage) params.set("stage", query.stage);
  if (query.jobId) params.set("job_id", query.jobId);
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.offset) params.set("offset", String(query.offset));
  const page = await apiFetch<ApiPage<ApiCandidateListItem>>(`/candidates?${params}`);
  return page.items.filter(isPipelineStage).map(fromListItem);
}

export async function getCandidate(id: string): Promise<PipelineCandidate | null> {
  if (USE_MOCK_API) return mockApi.getCandidate(id);
  const candidates = await getCandidates();
  return candidates.find((candidate) => candidate.id === id) ?? null;
}

/** POST /candidates with the job, so the person and their application are created together. */
export async function createCandidate(input: NewCandidateInput): Promise<PipelineCandidate> {
  if (USE_MOCK_API) return mockApi.createCandidate(input);
  const detail = await apiFetch<ApiCandidateDetail>("/candidates", {
    method: "POST",
    body: JSON.stringify({
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      location: input.location || null,
      job_id: input.jobId,
      stage: input.stage,
    }),
  });
  return fromDetail(detail);
}

/** PATCH /applications/{id}/stage. The server records stage history and an activity entry. */
export async function updateCandidateStage(id: string, stage: CandidateStage): Promise<PipelineCandidate> {
  if (USE_MOCK_API) return mockApi.updateCandidateStage(id, stage);
  const row = await apiFetch<ApiCandidateListItem>(`/applications/${id}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage }),
  });
  return fromListItem(row);
}

export async function archiveCandidate(id: string): Promise<void> {
  if (USE_MOCK_API) return mockApi.archiveCandidate(id);
  await apiFetch<ApiCandidateListItem>(`/applications/${id}/archive`, { method: "POST" });
}

export async function restoreCandidate(id: string): Promise<PipelineCandidate> {
  if (USE_MOCK_API) return mockApi.restoreCandidate(id);
  return fromListItem(await apiFetch<ApiCandidateListItem>(`/applications/${id}/restore`, { method: "POST" }));
}

export async function getCandidateActivities(id: string): Promise<CandidateActivity[]> {
  if (USE_MOCK_API) return mockApi.getCandidateActivities(id);
  const activity = await apiFetch<ApiActivity[]>(`/applications/${id}/activity`);
  return activity.map((item) => fromActivity(item, id));
}

/** Everything the candidate panel's tabs need: GET /candidates/{candidateId} for one application. */
export async function getCandidateDetail(id: string, candidateId: string): Promise<CandidateDetail> {
  if (USE_MOCK_API) return mockApi.getCandidateDetail(id);
  const detail = await apiFetch<ApiCandidateDetail>(`/candidates/${candidateId}?application_id=${id}`);
  const candidate = fromDetail(detail);
  return {
    activities: detail.activity.map((item) => fromActivity(item, id)),
    interviews: forPanel(detail.interviews.map((interview) => fromInterview(interview, candidate))),
    messages: detail.messages.map(fromMessage),
    analysis: detail.ai_analysis && fromAnalysis(detail.ai_analysis),
    ashby:
      detail.application?.origin === "ashby"
        ? { stageTitle: detail.application.external_stage_title, status: detail.application.external_status }
        : null,
  };
}

const ACTIVITY_KINDS: Record<string, ActivityKind> = {
  application_created: "sourced",
  stage_changed: "stage",
  application_archived: "stage",
  application_restored: "stage",
  onboarding_started: "stage",
  interview_scheduled: "interview",
  interview_confirmed: "interview",
  interview_reschedule_requested: "interview",
  interview_completed: "interview",
  interview_cancelled: "interview",
  message_sent: "message",
  message_received: "message",
  resume_viewed: "document",
  document_shared: "document",
  prep_viewed: "document",
  question_asked: "question",
  assessment_sent: "assessment",
  assessment_completed: "assessment",
  offer_sent: "offer",
  offer_viewed: "offer",
  offer_accepted: "offer",
  profile_updated: "document",
  ai_analysis_generated: "ai",
};

function fromActivity(activity: ApiActivity, applicationId: string): CandidateActivity {
  return {
    id: activity.id,
    candidateId: applicationId,
    kind: ACTIVITY_KINDS[activity.activity_type] ?? "stage",
    label: activity.title,
    occurredAt: activity.created_at,
  };
}

export function fromAnalysis(analysis: ApiAnalysis): CandidateAnalysis {
  return {
    id: analysis.id,
    summary: analysis.summary,
    skillsMatched: analysis.skills_matched,
    missingSkills: analysis.missing_skills,
    strengths: analysis.strengths,
    concerns: analysis.concerns,
    suggestedQuestions: analysis.suggested_questions,
    recommendedNextStep: analysis.recommended_next_step,
    modelName: analysis.model_name,
    createdAt: analysis.created_at,
  };
}

// The workspace shows the five pipeline stages; rejected applications leave the board.
function isPipelineStage(item: { stage: string }): boolean {
  return (PIPELINE_STAGES as readonly string[]).includes(item.stage);
}

function fromListItem(item: ApiCandidateListItem): PipelineCandidate {
  return {
    id: item.application_id,
    candidateId: item.candidate.id,
    jobId: item.job.id,
    name: item.candidate.full_name,
    avatarUrl: item.candidate.avatar_url ?? undefined,
    role: item.job.title,
    email: item.candidate.email,
    location: item.candidate.location ?? undefined,
    pronouns: item.candidate.pronouns ?? undefined,
    stage: item.stage as CandidateStage,
    lastActivity: item.last_activity?.title ?? "No activity yet",
    lastActivityAt: item.last_activity?.created_at ?? item.applied_at,
    engagement: item.engagement.level,
    engagementScore: item.engagement.score,
    portalLastActiveAt: item.engagement.last_active_at ?? undefined,
    portalStatus: item.candidate.portal_status,
    origin: item.origin,
    followUp: item.engagement.follow_up_reason ? { reason: item.engagement.follow_up_reason } : undefined,
    nextStep: item.next_interview ? { title: item.next_interview.title, date: item.next_interview.scheduled_at } : undefined,
    skills: item.candidate.skills,
    addedAt: item.applied_at,
  };
}

function fromDetail(detail: ApiCandidateDetail): PipelineCandidate {
  const { application, job, engagement, stage } = detail;
  if (!application || !job || !engagement || !stage) throw new Error("This candidate has no application yet.");
  return fromListItem({
    application_id: application.id,
    candidate: detail.candidate,
    job,
    stage,
    source: application.source,
    origin: application.origin,
    applied_at: application.applied_at,
    updated_at: application.updated_at,
    archived_at: application.archived_at,
    last_activity: detail.activity[0] ?? null,
    engagement,
    next_interview: detail.next_interview,
  });
}

/** Upcoming interviews first (soonest first), then past ones (most recent first). */
function forPanel(interviews: ScheduledInterview[], now = Date.now()): ScheduledInterview[] {
  const upcoming = interviews.filter((interview) => new Date(interview.scheduledAt).getTime() > now);
  const past = interviews.filter((interview) => new Date(interview.scheduledAt).getTime() <= now).reverse();
  return [...upcoming, ...past];
}
