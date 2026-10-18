"use client";

import { CircleAlert, CircleCheck, CircleDashed, EyeOff, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";

import { CommunicationBadge } from "@/components/recruiter/communication/CommunicationBadge";
import { DraftPanel } from "@/components/recruiter/communication/DraftPanel";
import { PortalAccessRow } from "@/components/recruiter/communication/PortalAccessRow";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { firstName, formatRelativeTime, formatSchedule } from "@/lib/format";
import { STAGE_LABELS } from "@/types/application";
import type { CommunicationHealth } from "@/types/communication";
import type { PipelineCandidate } from "@/types/workspace";

type CommunicationCardProps = { candidate: PipelineCandidate; health?: CommunicationHealth; loading: boolean };

/**
 * Communication health for one candidate: the stage only the team sees next to the status the
 * candidate sees, what they've heard and what they're waiting for, and a draft to fix it.
 */
export function CommunicationCard({ candidate, health, loading }: CommunicationCardProps) {
  const { emailConfigured, refresh } = useWorkspace();
  const [drafting, setDrafting] = useState(false);
  const first = firstName(candidate.name);

  return (
    <section aria-labelledby="communication-heading" className="rounded-[12px] border border-border bg-ink/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 id="communication-heading" className="text-[15px] font-medium tracking-tight text-ink">
          Communication
        </h3>
        {health ? <CommunicationBadge status={health.status} /> : <CommunicationBadge status={candidate.communication.status} />}
      </div>

      <dl className="mt-3.5 grid grid-cols-2 gap-3">
        <div className="rounded-[10px] bg-ink/[0.04] p-3 ring-1 ring-ink/10">
          <dt className="text-xs text-stone">Internal stage</dt>
          <dd className="mt-0.5 text-sm font-medium text-ink">{STAGE_LABELS[candidate.stage]}</dd>
        </div>
        <div className="rounded-[10px] bg-ink/[0.04] p-3 ring-1 ring-ink/10">
          <dt className="text-xs text-stone">What {first} sees</dt>
          <dd className="mt-0.5 text-sm font-medium text-ink">{health?.candidateStatus ?? "…"}</dd>
        </div>
      </dl>

      {loading && !health ? (
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : health ? (
        <>
          {health.attention.length > 0 && (
            <ul className="mt-3.5 flex flex-col gap-1.5" aria-label="Needs attention">
              {health.attention.map((reason) => (
                <li key={reason.rule} className="flex items-start gap-2 text-sm text-caution">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-medium">{reason.title}.</span>{" "}
                    <span className="text-charcoal">
                      {reason.rule === "unanswered_question" ? `“${reason.detail}”` : reason.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-3.5 flex flex-col divide-y divide-border text-sm">
            <Fact label="Last update">
              {health.lastUpdateAt ? (
                <span suppressHydrationWarning>{formatRelativeTime(health.lastUpdateAt)}</span>
              ) : (
                <span className="text-caution" suppressHydrationWarning>
                  None since they applied {formatRelativeTime(health.waitingSince)}
                </span>
              )}
            </Fact>
            <Fact label="Their messages">
              {health.openQuestion ? (
                <Status tone="caution">
                  Waiting for a reply since <span suppressHydrationWarning>{formatRelativeTime(health.openQuestion.askedAt)}</span>
                </Status>
              ) : (
                <Status tone="done">All answered</Status>
              )}
            </Fact>
            {health.nextInterview && (
              <Fact label="Next interview">
                <span className="text-charcoal">
                  {health.nextInterview.title} · <span suppressHydrationWarning>{formatSchedule(health.nextInterview.scheduledAt)}</span>
                </span>
                {health.nextInterview.confirmed ? (
                  <Status tone="done">Confirmed</Status>
                ) : (
                  <Status tone="caution">Not confirmed</Status>
                )}
              </Fact>
            )}
            {health.lastInterview && (
              <Fact label="After the interview">
                <span className="text-charcoal">{health.lastInterview.title}</span>
                {health.lastInterview.followedUp ? (
                  <Status tone="done">Followed up</Status>
                ) : (
                  <Status tone="caution">No follow-up yet</Status>
                )}
              </Fact>
            )}
            {health.attention.length === 0 && health.nextDueAt && (
              <Fact label="Next update due">
                <span suppressHydrationWarning>{formatRelativeTime(health.nextDueAt)}</span>
              </Fact>
            )}
            <PortalAccessRow candidate={candidate} />
          </dl>
        </>
      ) : null}

      {drafting ? (
        <DraftPanel
          className="mt-3.5"
          applicationId={candidate.id}
          firstName={first}
          reason={health?.attention[0]?.rule}
          emailConfigured={emailConfigured}
          onSent={() => window.setTimeout(() => {
            setDrafting(false);
            refresh().catch(() => undefined);
          }, 1200)}
          onClose={() => setDrafting(false)}
        />
      ) : (
        <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button variant={health?.attention.length ? "ai" : "secondary"} size="sm" onClick={() => setDrafting(true)}>
            <Sparkles /> Draft update
          </Button>
          <p className="flex items-center gap-1.5 text-xs text-stone">
            <EyeOff aria-hidden className="size-3.5" /> Notes, feedback and reasons never reach {first}.
          </p>
        </div>
      )}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 first:pt-0 last:pb-0">
      <dt className="text-xs text-stone">{label}</dt>
      <dd className="flex flex-wrap items-center gap-x-2 text-right text-[13px]">{children}</dd>
    </div>
  );
}

function Status({ tone, children }: { tone: "done" | "caution"; children: ReactNode }) {
  const Icon = tone === "done" ? CircleCheck : CircleDashed;
  return (
    <span className={tone === "done" ? "inline-flex items-center gap-1 text-sage" : "inline-flex items-center gap-1 text-caution"}>
      <Icon aria-hidden className="size-3.5" />
      {children}
    </span>
  );
}
