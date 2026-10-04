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
  connected: { label: "Connected", className: "bg-emerald-400/10 text-emerald-200 ring-emerald-300/20" },
  disconnected: { label: "Not connected", className: "bg-white/[0.06] text-stone ring-white/10" },
  error: { label: "Needs attention", className: "bg-amber-400/10 text-amber-200 ring-amber-300/20" },
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
          <span className={cn("rounded-[8px] px-2.5 py-1 text-xs font-medium ring-1 ring-inset", STATE[data.status].className)}>
            {STATE[data.status].label}
          </span>
        )}
      </div>
      {!data ? (
        <p className="mt-4 text-sm text-stone">{error ?? "Checking the connection…"}</p>
      ) : (
        <>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
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
          {data.lastError && <p className="mt-4 rounded-[12px] bg-amber-400/[0.06] px-3.5 py-2.5 text-sm text-amber-100 ring-1 ring-amber-300/20">{data.lastError}</p>}
          <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
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
