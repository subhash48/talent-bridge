import { USE_MOCK_API, apiFetch } from "@/services/api";
import { mockApi } from "@/services/mock/api";
import type { DashboardRow } from "@/types/application";
import type { ActivityEvent, EngagementSignal, EventType } from "@/types/event";
import {
  PIPELINE_STAGES,
  type ActivityKind,
  type CandidateActivity,
  type CandidateDetail,
  type CandidateStage,
  type DashboardSummary,
  type NewCandidateInput,
  type PipelineCandidate,
  type ScheduledInterview,
  type ThreadMessage,
} from "@/types/workspace";

// Staff façade for candidates and applications (ARCHITECTURE.md 8.2).

export function getDashboardSummary(token?: string): Promise<DashboardSummary> {
  if (USE_MOCK_API) return mockApi.getDashboardSummary();
  return apiFetch<DashboardSummary>("/v1/dashboard/summary", { token });
}

export async function getCandidates(token?: string): Promise<PipelineCandidate[]> {
  if (USE_MOCK_API) return mockApi.getCandidates();
  const { rows } = await apiFetch<{ rows: DashboardRow[] }>("/v1/dashboard", { token });
  return rows.filter(isPipelineRow).map(fromDashboardRow);
}

export async function getCandidate(id: string, token?: string): Promise<PipelineCandidate | null> {
  if (USE_MOCK_API) return mockApi.getCandidate(id);
  const candidates = await getCandidates(token);
  return candidates.find((candidate) => candidate.id === id) ?? null;
}

export async function createCandidate(input: NewCandidateInput, token?: string): Promise<PipelineCandidate> {
  if (USE_MOCK_API) return mockApi.createCandidate(input);
  const row = await apiFetch<DashboardRow>("/v1/candidates", {
    token,
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      role: input.role,
      location: input.location || null,
      stage: input.stage,
    }),
  });
  return fromDashboardRow(row);
}

export async function updateCandidateStage(id: string, stage: CandidateStage, token?: string): Promise<PipelineCandidate> {
  if (USE_MOCK_API) return mockApi.updateCandidateStage(id, stage);
  const row = await apiFetch<DashboardRow>(`/v1/applications/${id}/stage`, {
    token,
    method: "PATCH",
    body: JSON.stringify({ to: stage }),
  });
  return fromDashboardRow(row);
}

export async function archiveCandidate(id: string, token?: string): Promise<void> {
  if (USE_MOCK_API) return mockApi.archiveCandidate(id);
  await apiFetch<void>(`/v1/applications/${id}`, { token, method: "PATCH", body: JSON.stringify({ status: "archived" }) });
}

export async function restoreCandidate(id: string, token?: string): Promise<PipelineCandidate> {
  if (USE_MOCK_API) return mockApi.restoreCandidate(id);
  const row = await apiFetch<DashboardRow>(`/v1/applications/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify({ status: "active" }),
  });
  return fromDashboardRow(row);
}

export async function getCandidateActivities(id: string, token?: string): Promise<CandidateActivity[]> {
  if (USE_MOCK_API) return mockApi.getCandidateActivities(id);
  const events = await apiFetch<ActivityEvent[]>(`/v1/applications/${id}/events`, { token });
  return events.map((event) => ({
    id: event.id,
    candidateId: id,
    kind: ACTIVITY_KINDS[event.event_type] ?? "stage",
    label: event.label,
    occurredAt: event.occurred_at,
  }));
}

/** Everything the candidate panel's tabs need, loaded when a candidate is selected. */
export async function getCandidateDetail(id: string, token?: string): Promise<CandidateDetail> {
  if (USE_MOCK_API) return mockApi.getCandidateDetail(id);
  const [activities, interviews, messages, engagement] = await Promise.all([
    getCandidateActivities(id, token),
    apiFetch<ScheduledInterview[]>(`/v1/interviews?application_id=${id}`, { token }),
    apiFetch<ThreadMessage[]>(`/v1/applications/${id}/messages`, { token }),
    apiFetch<{ signals: EngagementSignal[] }>(`/v1/applications/${id}/engagement`, { token }),
  ]);
  return { activities, interviews, messages, signals: engagement.signals };
}

const ACTIVITY_KINDS: Partial<Record<EventType, ActivityKind>> = {
  interview_confirmed: "interview",
  interview_scheduled: "interview",
  interview_completed: "interview",
  interview_reschedule_requested: "interview",
  interview_prep_viewed: "document",
  resource_viewed: "document",
  document_uploaded: "document",
  ai_question_asked: "question",
  message_received: "message",
  message_sent: "message",
  assessment_completed: "assessment",
  offer_viewed: "offer",
  application_stage_changed: "stage",
};

function isPipelineRow(row: DashboardRow): boolean {
  return (PIPELINE_STAGES as readonly string[]).includes(row.stage);
}

/** Maps the documented GET /v1/dashboard row (ARCHITECTURE.md 8.5) to the workspace view model. */
function fromDashboardRow(row: DashboardRow): PipelineCandidate {
  const stage = (PIPELINE_STAGES as readonly string[]).includes(row.stage) ? (row.stage as CandidateStage) : "screening";
  return {
    id: row.application_id,
    name: row.candidate.name,
    avatarUrl: row.candidate.avatar_url ?? undefined,
    role: row.job.title,
    stage,
    lastActivity: row.last_activity?.label ?? "No activity yet",
    lastActivityAt: row.last_activity?.at ?? new Date(0).toISOString(),
    engagement: row.engagement.level,
    followUp: row.next_action.follow_up ? { reason: row.next_action.reason ?? row.next_action.label } : undefined,
    skills: [],
    addedAt: row.last_activity?.at ?? new Date(0).toISOString(),
  };
}
