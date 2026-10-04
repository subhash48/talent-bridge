import { USE_MOCK_API, apiFetch } from "@/services/api";
import type { ApiAshbyStatus, ApiEngagementBreakdown, ApiPortalAccess } from "@/types/api";
import type { EngagementBreakdown, PortalAccess } from "@/types/workspace";

// Candidate engagement and portal access, for recruiters. Engagement is operational information:
// it is shown with its reasons and is never used to rank, advance or reject anyone.

/** GET /candidates/{id}/engagement for one application. Null in mock mode, which has no portal. */
export async function getEngagement(candidateId: string, applicationId: string): Promise<EngagementBreakdown | null> {
  if (USE_MOCK_API) return null;
  const data = await apiFetch<ApiEngagementBreakdown>(
    `/candidates/${candidateId}/engagement?application_id=${encodeURIComponent(applicationId)}`,
  );
  return {
    score: data.score,
    label: data.label,
    level: data.level,
    sufficientData: data.sufficient_data,
    portalActivity: {
      score: data.portal_activity.score,
      max: data.portal_activity.max,
      neutral: data.portal_activity.neutral,
      visits: data.portal_activity.sessions,
      activeMinutes: data.portal_activity.active_minutes,
      meaningfulViews: data.portal_activity.meaningful_views,
      lastActiveAt: data.portal_activity.last_active_at,
    },
    responsiveness: {
      score: data.responsiveness.score,
      max: data.responsiveness.max,
      neutral: data.responsiveness.neutral,
      opportunities: data.responsiveness.response_opportunities,
      responses: data.responsiveness.responses,
      pending: data.responsiveness.pending,
      medianMinutes: data.responsiveness.median_response_minutes,
    },
    communication: {
      score: data.communication.score,
      max: data.communication.max,
      initiatedMessages: data.communication.initiated_messages,
      confirmations: data.communication.confirmations,
      confirmationOpportunities: data.communication.confirmation_opportunities,
      thankYouNotes: data.communication.thank_you_notes,
      followUps: data.communication.follow_ups,
    },
    proactiveActions: data.proactive_actions,
    overall: {
      visits: data.overall.visits,
      activeMinutes: data.overall.active_minutes,
      lastActiveAt: data.overall.last_active_at,
    },
    portalAccess: fromAccess(data.portal_access),
    recentPortalActivity: data.recent_portal_activity.map((item) => ({ label: item.label, occurredAt: item.occurred_at, count: item.count })),
    note: data.note,
  };
}

/** POST /candidates/{id}/portal-invite: send or retry the portal invitation. Never sets a password. */
export async function inviteToPortal(candidateId: string): Promise<PortalAccess> {
  return fromAccess(await apiFetch<ApiPortalAccess>(`/candidates/${candidateId}/portal-invite`, { method: "POST" }));
}

export type AshbyStatus = {
  status: ApiAshbyStatus["status"];
  apiKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  portalInvitesConfigured: boolean;
  lastWebhookAt: string | null;
  lastWebhookAction: string | null;
  webhooksFailedLast7Days: number;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  invitationsPending: number;
  invitationsFailed: number;
};

/** GET /integrations/ashby/status. Null in mock mode. */
export async function getAshbyStatus(): Promise<AshbyStatus | null> {
  if (USE_MOCK_API) return null;
  const data = await apiFetch<ApiAshbyStatus>("/integrations/ashby/status");
  return {
    status: data.status,
    apiKeyConfigured: data.api_key_configured,
    webhookSecretConfigured: data.webhook_secret_configured,
    portalInvitesConfigured: data.portal_invites_configured,
    lastWebhookAt: data.last_webhook_at,
    lastWebhookAction: data.last_webhook_action,
    webhooksFailedLast7Days: data.webhooks_failed_last_7_days,
    lastSuccessfulSyncAt: data.last_successful_sync_at,
    lastError: data.last_error,
    invitationsPending: data.invitations_pending,
    invitationsFailed: data.invitations_failed,
  };
}

/** POST /integrations/ashby/sync: pull what changed in Ashby. Safe to run at any time. */
export async function syncAshby(): Promise<void> {
  await apiFetch<unknown>("/integrations/ashby/sync", { method: "POST" });
}

function fromAccess(access: ApiPortalAccess): PortalAccess {
  return { status: access.status, invitedAt: access.invited_at, activatedAt: access.activated_at, problem: access.problem };
}
