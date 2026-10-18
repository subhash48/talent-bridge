import { USE_MOCK_API, apiFetch } from "@/services/api";
import type { ApiAshbyStatus, ApiPortalAccess } from "@/types/api";
import type { PortalAccess } from "@/types/workspace";

// Candidate portal access and the Ashby integration's health, for recruiters.

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
