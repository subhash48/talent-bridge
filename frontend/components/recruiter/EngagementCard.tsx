"use client";

import { ChevronDown, Info, LoaderCircle, Send } from "lucide-react";
import { useState, type ReactNode } from "react";

import { DetailError } from "@/components/recruiter/DetailError";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toaster";
import { useEngagement } from "@/hooks/useEngagement";
import { formatActiveTime, formatResponseTime, pluralize } from "@/lib/format";
import { ENGAGEMENT_STYLES } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import { inviteToPortal } from "@/services/engagement";
import type { EngagementBreakdown, PipelineCandidate, PortalAccessStatus } from "@/types/workspace";

const ACCESS_LABELS: Record<PortalAccessStatus, string> = {
  not_required: "Not invited",
  pending_invitation: "Invitation pending",
  invited: "Invited",
  active: "Activated",
  invite_failed: "Invitation failed",
};

/**
 * How the candidate has engaged with the process: a transparent 0-100 with the reasons behind it.
 * Operational information only. It is not a measure of candidate quality, the candidate never sees
 * it, and nothing uses it to rank, advance or reject anyone.
 */
export function EngagementCard({ candidate }: { candidate: PipelineCandidate }) {
  const { data, error, retry, replace } = useEngagement(candidate);
  const [open, setOpen] = useState(false);

  if (data === null) return null; // mock mode: no candidate portal
  if (!data) {
    return error ? <DetailError message={error} onRetry={retry} /> : <Skeleton className="h-[188px] rounded-[10px]" />;
  }

  const { portalActivity: portal, responsiveness } = data;
  return (
    <section aria-label="Candidate engagement" className="rounded-[10px] border border-border bg-ink/[0.03] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-medium tracking-tight text-ink">Candidate engagement</h3>
          <p className="mt-0.5 text-xs text-stone">How they’ve engaged with the process, not how good they are.</p>
        </div>
        <div className="shrink-0 text-right whitespace-nowrap">
          <p className="text-2xl leading-none font-semibold tracking-tight text-ink tabular-nums">
            {data.score ?? "—"}
            <span className="text-sm font-normal text-faint"> / 100</span>
          </p>
          <p className={cn("mt-1 text-xs font-medium", ENGAGEMENT_STYLES[data.level])}>{data.label}</p>
        </div>
      </div>

      <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm @[26rem]:grid-cols-3">
        <Metric label="Last active">
          {portal.lastActiveAt ? <RelativeTime iso={portal.lastActiveAt} /> : "Not yet"}
        </Metric>
        <Metric label="Visits">{portal.visits}</Metric>
        <Metric label="Active time">{formatActiveTime(portal.activeMinutes)}</Metric>
        <Metric label="Typical response">
          {responsiveness.medianMinutes !== null ? formatResponseTime(responsiveness.medianMinutes) : "Nothing asked yet"}
        </Metric>
        <Metric label="Proactive actions">{data.proactiveActions}</Metric>
        <Metric label="Portal">
          <PortalAccessValue candidateId={candidate.candidateId} access={data.portalAccess} onChange={(access) => replace((current) => ({ ...current, portalAccess: access }))} />
        </Metric>
      </dl>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mt-3.5 inline-flex items-center gap-1.5 rounded-sm text-sm text-charcoal transition-colors hover:text-ink"
      >
        {open ? "Hide engagement details" : "View engagement details"}
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && <EngagementDetails data={data} />}
    </section>
  );
}

function EngagementDetails({ data }: { data: EngagementBreakdown }) {
  const { portalActivity: portal, responsiveness, communication } = data;
  const confirmed = communication.confirmationOpportunities
    ? `${communication.confirmations} of ${pluralize(communication.confirmationOpportunities, "interview")} confirmed`
    : "no interview to confirm yet";
  return (
    <div className="mt-3.5 flex flex-col gap-3.5 border-t border-border pt-3.5">
      {!data.sufficientData && (
        <p className="text-xs text-stone">Too little activity so far to give a score. The parts below show what there is.</p>
      )}
      <Component
        title="Portal activity"
        score={portal.score}
        max={portal.max}
        explanation={
          portal.neutral
            ? "Hasn’t had portal access yet, so this counts half, not zero."
            : `${pluralize(portal.visits, "visit")} · ${formatActiveTime(portal.activeMinutes)} active · ${pluralize(portal.meaningfulViews, "view")} of their application, interviews, prep or messages`
        }
      />
      <Component
        title="Responsiveness"
        score={responsiveness.score}
        max={responsiveness.max}
        explanation={
          responsiveness.neutral
            ? "Nothing has been asked of them yet, so this counts half, not zero."
            : `${responsiveness.responses} of ${pluralize(responsiveness.opportunities, "request")} answered` +
              (responsiveness.medianMinutes !== null ? ` · typically ${formatResponseTime(responsiveness.medianMinutes)}` : "") +
              (responsiveness.pending ? ` · ${responsiveness.pending} still open` : "")
        }
      />
      <Component
        title="Proactive communication"
        score={communication.score}
        max={communication.max}
        explanation={`${pluralize(communication.initiatedMessages, "message")} they started · ${confirmed} · ${pluralize(communication.thankYouNotes, "thank-you note")} · ${pluralize(communication.followUps, "follow-up")}`}
      />
      {data.recentPortalActivity.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-stone">Recent portal activity</h4>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-charcoal">
            {data.recentPortalActivity.map((item) => (
              <li key={`${item.label}-${item.occurredAt}`} className="flex items-center justify-between gap-3">
                <span>
                  {item.label}
                  {item.count > 1 && <span className="text-stone"> ({item.count} times)</span>}
                </span>
                <RelativeTime iso={item.occurredAt} className="text-xs text-faint" />
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="flex items-start gap-2 text-xs leading-relaxed text-faint">
        <Info aria-hidden className="mt-px size-3.5 shrink-0" />
        {data.note} Visits and time count only while the portal is open and in use; repeated actions are capped.
      </p>
    </div>
  );
}

function Component({ title, score, max, explanation }: { title: string; score: number; max: number; explanation: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-ink">{title}</span>
        <span className="text-charcoal tabular-nums">
          {score} <span className="text-faint">/ {max}</span>
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]"
        role="meter"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={score}
      >
        <div className="h-full rounded-full bg-ink/50" style={{ width: `${(score / max) * 100}%` }} />
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-stone">{explanation}</p>
    </div>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-stone">{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-ink">{children}</dd>
    </div>
  );
}

function PortalAccessValue({
  candidateId,
  access,
  onChange,
}: {
  candidateId: string;
  access: EngagementBreakdown["portalAccess"];
  onChange: (access: EngagementBreakdown["portalAccess"]) => void;
}) {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const canInvite = access.status === "invite_failed" || access.status === "not_required" || access.status === "pending_invitation";

  async function invite() {
    setSending(true);
    try {
      const result = await inviteToPortal(candidateId);
      onChange(result);
      toast(
        result.status === "invite_failed" || result.problem
          ? { title: "Invitation not sent", description: result.problem ?? "Try again shortly.", tone: "error" }
          : { title: "Portal invitation sent", description: "They’ll choose their own password from the email.", tone: "success" },
      );
    } catch (error) {
      toast({ title: "Invitation not sent", description: errorMessage(error), tone: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <span className="flex items-center gap-1.5" title={access.problem ?? undefined}>
      <span className={cn(access.status === "invite_failed" && "text-caution")}>{ACCESS_LABELS[access.status]}</span>
      {canInvite && (
        <Button variant="ghost" size="icon-sm" onClick={() => void invite()} disabled={sending} aria-label={access.status === "invite_failed" ? "Retry the portal invitation" : "Send a portal invitation"}>
          {sending ? <LoaderCircle className="animate-spin" /> : <Send />}
        </Button>
      )}
    </span>
  );
}
