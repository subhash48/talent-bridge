import { USE_MOCK_API, apiFetch } from "@/services/api";
import { fromMessage } from "@/services/messages";
import { mockCommunication } from "@/services/mock/communication";
import type {
  ApiAttentionList,
  ApiAttentionReason,
  ApiCommunicationAnalytics,
  ApiCommunicationHealth,
  ApiCommunicationRule,
  ApiDraftSent,
  ApiEmailDelivery,
  ApiUpdateDraft,
} from "@/types/api";
import type {
  AttentionList,
  AttentionReason,
  CommunicationAnalytics,
  CommunicationHealth,
  CommunicationRule,
  CommunicationRuleSetting,
  DraftReason,
  EmailDeliveryStatus,
  UpdateDraft,
} from "@/types/communication";
import type { ThreadMessage } from "@/types/workspace";

// Candidate communication. The AI drafts; a recruiter edits and approves every message before it's
// sent, and sending reaches the candidate portal at once and their email when it's configured.

/** GET /communication/attention: who needs an update, longest overdue first. */
export async function getAttention(): Promise<AttentionList> {
  if (USE_MOCK_API) return mockCommunication.getAttention();
  const list = await apiFetch<ApiAttentionList>("/communication/attention");
  return {
    items: list.items.map((item) => ({
      applicationId: item.candidate.application_id,
      candidateId: item.candidate.candidate_id,
      name: item.candidate.full_name,
      role: item.candidate.job_title,
      avatarUrl: item.candidate.avatar_url ?? undefined,
      stage: item.stage,
      candidateStatus: item.candidate_status,
      lastUpdateAt: item.last_update_at ?? undefined,
      daysSinceUpdate: item.days_since_update,
      reasons: item.reasons.map(fromReason),
      draft: item.draft ? fromDraft(item.draft) : undefined,
    })),
    counts: list.counts,
    upcoming: list.upcoming,
  };
}

/** GET /applications/{id}/communication. */
export async function getCommunicationHealth(applicationId: string): Promise<CommunicationHealth | null> {
  if (USE_MOCK_API) return mockCommunication.getHealth(applicationId);
  return fromHealth(await apiFetch<ApiCommunicationHealth>(`/applications/${applicationId}/communication`));
}

/** POST /communication/drafts: an AI draft for the reason given, or the rule that needs attention. */
export async function draftUpdate(
  applicationId: string,
  reason?: DraftReason,
  instructions?: string,
  signal?: AbortSignal,
): Promise<UpdateDraft> {
  if (USE_MOCK_API) return mockCommunication.draftUpdate(applicationId, reason, signal);
  const draft = await apiFetch<ApiUpdateDraft>("/communication/drafts", {
    method: "POST",
    body: JSON.stringify({ application_id: applicationId, reason, instructions: instructions || undefined }),
    signal,
  });
  return fromDraft(draft);
}

/** POST /communication/drafts/{id}/send: the recruiter's approval, with their final wording. Once. */
export async function sendDraft(
  draftId: string,
  subject: string,
  body: string,
): Promise<{ draft: UpdateDraft; message: ThreadMessage }> {
  if (USE_MOCK_API) return mockCommunication.sendDraft(draftId, subject, body);
  const sent = await apiFetch<ApiDraftSent>(`/communication/drafts/${draftId}/send`, {
    method: "POST",
    body: JSON.stringify({ subject, body }),
  });
  return { draft: fromDraft(sent.draft), message: fromMessage(sent.message) };
}

export async function discardDraft(draftId: string): Promise<void> {
  if (USE_MOCK_API) return mockCommunication.discardDraft(draftId);
  await apiFetch<ApiUpdateDraft>(`/communication/drafts/${draftId}/discard`, { method: "POST" });
}

export async function getEmailDelivery(): Promise<EmailDeliveryStatus> {
  if (USE_MOCK_API) return { configured: false };
  const status = await apiFetch<ApiEmailDelivery>("/communication/email");
  return { configured: status.configured, provider: status.provider ?? undefined, sender: status.sender ?? undefined };
}

export async function getCommunicationRules(): Promise<CommunicationRuleSetting[]> {
  if (USE_MOCK_API) return mockCommunication.getRules();
  return (await apiFetch<ApiCommunicationRule[]>("/communication/rules")).map(fromRule);
}

export async function updateCommunicationRule(
  key: CommunicationRule,
  enabled: boolean,
  thresholdHours: number,
): Promise<CommunicationRuleSetting> {
  if (USE_MOCK_API) return mockCommunication.updateRule(key, enabled, thresholdHours);
  const rule = await apiFetch<ApiCommunicationRule>(`/communication/rules/${key}`, {
    method: "PUT",
    body: JSON.stringify({ enabled, threshold_hours: thresholdHours }),
  });
  return fromRule(rule);
}

export async function getCommunicationAnalytics(days: number): Promise<CommunicationAnalytics> {
  if (USE_MOCK_API) return mockCommunication.getAnalytics(days);
  const a = await apiFetch<ApiCommunicationAnalytics>(`/communication/analytics?days=${days}`);
  return {
    days: a.days,
    needsAttention: a.needs_attention,
    unansweredMessages: a.unanswered_messages,
    medianHoursBetweenUpdates: a.median_hours_between_updates,
    slaCompliance: a.sla_compliance,
    compliance: a.compliance,
    interviewConfirmationRate: a.interview_confirmation_rate,
    interviewsConfirmed: a.interviews_confirmed,
    interviewsTotal: a.interviews_total,
    updatesSent: a.updates_sent,
    emailsSent: a.emails_sent,
    emailsFailed: a.emails_failed,
    draftsGenerated: a.drafts_generated,
    draftsSent: a.drafts_sent,
    draftsSentUnedited: a.drafts_sent_unedited,
    draftsDiscarded: a.drafts_discarded,
    minutesSaved: a.minutes_saved,
    minutesSavedPerDraft: a.minutes_saved_per_draft,
  };
}

export function fromHealth(health: ApiCommunicationHealth): CommunicationHealth {
  return {
    status: health.status,
    candidateStatus: health.candidate_status,
    lastUpdateAt: health.last_update_at ?? undefined,
    waitingSince: health.waiting_since,
    daysSinceUpdate: health.days_since_update,
    openQuestion: health.open_question
      ? {
          messageId: health.open_question.message_id,
          askedAt: health.open_question.asked_at,
          excerpt: health.open_question.excerpt,
          count: health.open_question.count,
        }
      : undefined,
    nextInterview: health.next_interview
      ? {
          interviewId: health.next_interview.interview_id,
          title: health.next_interview.title,
          scheduledAt: health.next_interview.scheduled_at,
          confirmed: health.next_interview.confirmed,
        }
      : undefined,
    lastInterview: health.last_interview
      ? {
          interviewId: health.last_interview.interview_id,
          title: health.last_interview.title,
          endedAt: health.last_interview.ended_at,
          followedUp: health.last_interview.followed_up,
        }
      : undefined,
    stageChange: health.stage_change
      ? { stage: health.stage_change.stage, changedAt: health.stage_change.changed_at, told: health.stage_change.told }
      : undefined,
    attention: health.attention.map(fromReason),
    nextDueAt: health.next_due_at ?? undefined,
  };
}

function fromReason(reason: ApiAttentionReason): AttentionReason {
  return {
    rule: reason.rule,
    title: reason.title,
    detail: reason.detail,
    since: reason.since,
    dueAt: reason.due_at,
    interviewId: reason.interview_id ?? undefined,
    messageId: reason.message_id ?? undefined,
  };
}

function fromDraft(draft: ApiUpdateDraft): UpdateDraft {
  return {
    id: draft.id,
    applicationId: draft.application_id,
    reason: draft.reason,
    status: draft.status,
    subject: draft.subject,
    body: draft.body,
    edited: draft.edited,
    modelName: draft.model_name ?? undefined,
    createdAt: draft.created_at,
  };
}

function fromRule(rule: ApiCommunicationRule): CommunicationRuleSetting {
  return {
    key: rule.key,
    title: rule.title,
    description: rule.description,
    unit: rule.unit,
    enabled: rule.enabled,
    thresholdHours: rule.threshold_hours,
    defaultHours: rule.default_hours,
  };
}
