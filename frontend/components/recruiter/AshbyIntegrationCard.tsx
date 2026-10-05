"use client";

import { LoaderCircle, RefreshCw, Workflow } from "lucide-react";
import { useState, type ReactNode } from "react";

import { RelativeTime } from "@/components/shared/RelativeTime";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toaster";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import { getAshbyStatus, syncAshby, type AshbyStatus } from "@/services/engagement";

const STATE: Record<AshbyStatus["status"], { label: string; className: string }> = {
  connected: { label: "Connected", className: "bg-sage/10 text-sage ring-sage/20" },
  disconnected: { label: "Not connected", className: "bg-ink/[0.06] text-stone ring-ink/10" },
  error: { label: "Needs attention", className: "bg-caution/10 text-caution ring-caution/20" },
};

/** Ashby connection health: webhooks, the reconciliation sync and portal invitations. */
export function AshbyIntegrationCard() {
  const { data, error, refresh } = useLiveQuery(getAshbyStatus, { intervalMs: 60_000 });
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);

  if (data === null) return null; // mock mode
  async function sync() {
    setSyncing(true);
    try {
      await syncAshby();
      toast({ title: "Ashby sync finished", description: "Jobs, applications and interviews are up to date.", tone: "success" });
    } catch (syncError) {
      toast({ title: "Ashby sync failed", description: errorMessage(syncError), tone: "error" });
    } finally {
      setSyncing(false);
      void refresh();
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-stone">
          <Workflow aria-hidden className="size-4" /> Ashby
        </h2>
        {data && (
          <span className={cn("inline-flex h-6 items-center justify-center rounded-[6px] px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset", STATE[data.status].className)}>
            {STATE[data.status].label}
          </span>
        )}
      </div>
      {!data ? (
        <p className="mt-3.5 text-sm text-stone">{error ?? "Checking the connection…"}</p>
      ) : (
        <>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <Item label="Last webhook">
              {data.lastWebhookAt ? (
                <>
                  <RelativeTime iso={data.lastWebhookAt} /> <span className="text-stone">({data.lastWebhookAction})</span>
                </>
              ) : (
                "None received yet"
              )}
            </Item>
            <Item label="Last successful sync">{data.lastSuccessfulSyncAt ? <RelativeTime iso={data.lastSuccessfulSyncAt} /> : "Never"}</Item>
            <Item label="Portal invitations">
              {data.portalInvitesConfigured ? "Configured" : "Not configured"}
              {(data.invitationsPending > 0 || data.invitationsFailed > 0) &&
                ` · ${data.invitationsPending} waiting, ${data.invitationsFailed} failed`}
            </Item>
            <Item label="Setup">
              {[data.apiKeyConfigured ? "API key" : "No API key", data.webhookSecretConfigured ? "webhook secret" : "no webhook secret"].join(", ")}
            </Item>
          </dl>
          {data.lastError && <p className="mt-3.5 rounded-[10px] bg-caution/[0.06] px-3.5 py-2.5 text-sm text-caution ring-1 ring-caution/20">{data.lastError}</p>}
          <div className="mt-4 flex items-center gap-3 border-t border-border pt-3.5">
            <Button variant="secondary" size="sm" onClick={() => void sync()} disabled={syncing || !data.apiKeyConfigured}>
              {syncing ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Sync now
            </Button>
            <p className="text-xs text-stone">Pulls anything webhooks missed. Safe to run at any time.</p>
          </div>
        </>
      )}
    </Card>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-stone">{label}</dt>
      <dd className="mt-1 text-charcoal">{children}</dd>
    </div>
  );
}
