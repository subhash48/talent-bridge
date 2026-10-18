"use client";

import { CalendarCheck, Clock, Inbox, MessageCircleQuestion, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card } from "@/components/ui/Card";
import { FilterChip } from "@/components/ui/FilterChip";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import { getCommunicationAnalytics } from "@/services/communication";
import type { CommunicationAnalytics } from "@/types/communication";

const PERIODS = [7, 30, 90] as const;

type ViewProps = { initial: CommunicationAnalytics | null; error?: string };

/** Are candidates hearing from us, and on time? Communication only: nothing here measures candidates. */
export function CommunicationAnalyticsView({ initial, error }: ViewProps) {
  const { emailConfigured } = useWorkspace();
  const [report, setReport] = useState(initial);
  const [problem, setProblem] = useState(error);
  const [loading, setLoading] = useState(false);

  async function choose(days: number) {
    setLoading(true);
    try {
      setReport(await getCommunicationAnalytics(days));
      setProblem(undefined);
    } catch (caught) {
      setProblem(errorMessage(caught, "Couldn't load the analytics."));
    } finally {
      setLoading(false);
    }
  }

  const days = report?.days ?? 30;
  return (
    <div>
      <RecruiterHeader
        title="Analytics"
        subtitle="Are candidates hearing from you, and on time?"
        actions={
          <div role="group" aria-label="Period" className="flex gap-2">
            {PERIODS.map((period) => (
              <FilterChip key={period} active={days === period} onClick={() => void choose(period)} disabled={loading}>
                {period} days
              </FilterChip>
            ))}
          </div>
        }
      />
      {!report ? (
        <EmptyState title="Couldn't load the analytics" description={problem} />
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          <section aria-label="Headline numbers" className="@container">
            <div className="grid grid-cols-2 gap-3 @[52rem]:grid-cols-5">
              <Tile
                icon={Inbox}
                label="Need an update now"
                value={String(report.needsAttention)}
                hint={
                  report.needsAttention ? (
                    <Link href="/recruiter/today" className="underline underline-offset-2 hover:text-ink">
                      Open Today
                    </Link>
                  ) : (
                    "Nobody is waiting"
                  )
                }
                tone={report.needsAttention ? "caution" : "positive"}
              />
              <Tile
                icon={Clock}
                label="Median time between updates"
                value={formatGap(report.medianHoursBetweenUpdates)}
                hint="Includes silences still going on"
              />
              <Tile
                icon={ShieldCheck}
                label="Updates sent on time"
                value={percent(report.slaCompliance)}
                hint={report.slaCompliance === null ? "Nothing was due yet" : "Of updates the rules called for"}
              />
              <Tile
                icon={CalendarCheck}
                label="Interviews confirmed"
                value={percent(report.interviewConfirmationRate)}
                hint={`${report.interviewsConfirmed} of ${report.interviewsTotal}`}
              />
              <Tile
                icon={MessageCircleQuestion}
                label="Messages waiting for a reply"
                value={String(report.unansweredMessages)}
                hint="From candidates, right now"
                tone={report.unansweredMessages ? "caution" : undefined}
              />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="text-[15px] font-medium text-ink">On time, by rule</h2>
              <p className="mt-1 text-[13px] text-stone">
                Each update a rule called for in the last {days} days, and whether the candidate got it in time.
              </p>
              {report.compliance.every((rule) => rule.total === 0) ? (
                <p className="mt-5 text-sm text-stone">No updates were due in this period.</p>
              ) : (
                <ul className="mt-5 flex flex-col gap-4">
                  {report.compliance.map((rule) => (
                    <li key={rule.rule}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-charcoal">{rule.title}</span>
                        <span className="text-stone tabular-nums">
                          {rule.total ? `${rule.met} of ${rule.total} on time` : "None due"}
                        </span>
                      </div>
                      <Bar part={rule.met} whole={rule.total} label={`${rule.title}: ${rule.met} of ${rule.total} on time`} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="flex items-center gap-2 text-[15px] font-medium text-ink">
                <Sparkles aria-hidden className="size-4" /> AI drafts
              </h2>
              <p className="mt-1 text-[13px] text-stone">Drafts are only ever sent by a recruiter.</p>
              <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
                <Stat label="Drafted" value={report.draftsGenerated} />
                <Stat label="Approved and sent" value={report.draftsSent} />
                <Stat label="Discarded" value={report.draftsDiscarded} />
              </dl>
              <p className="mt-4 text-sm text-charcoal">
                {report.draftsSent
                  ? `${pluralize(report.draftsSentUnedited, "draft")} sent as written, ${report.draftsSent - report.draftsSentUnedited} edited first.`
                  : "No drafts sent yet in this period."}
              </p>
              <div className="mt-4 rounded-[10px] bg-ink/[0.04] p-3.5 ring-1 ring-ink/10">
                <p className="text-xs text-stone">Recruiter time saved (estimate)</p>
                <p className="mt-0.5 text-xl font-semibold text-ink">{formatMinutes(report.minutesSaved)}</p>
                <p className="mt-1 text-xs text-faint">
                  About {report.minutesSavedPerDraft} minutes for each AI draft a recruiter sent, instead of writing it from scratch.
                </p>
              </div>
            </Card>
          </div>

          <Card>
            <h2 className="text-[15px] font-medium text-ink">Delivery</h2>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
              <Stat label="Updates sent" value={report.updatesSent} />
              <Stat label="Emailed" value={report.emailsSent} />
              <Stat label="Email failed" value={report.emailsFailed} tone={report.emailsFailed ? "danger" : undefined} />
            </dl>
            {!emailConfigured && (
              <p className="mt-4 text-[13px] text-caution">
                Email isn&apos;t set up, so updates reach the candidate portal only.{" "}
                <Link href="/recruiter/settings#email" className="underline underline-offset-2 hover:text-ink">
                  Turn on email
                </Link>
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: ReactNode;
  tone?: "caution" | "positive";
}) {
  return (
    <article className="glass flex min-h-[112px] flex-col justify-between gap-2 rounded-[14px] border border-border px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="line-clamp-2 text-xs leading-snug text-stone">{label}</h2>
        <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-faint" />
      </div>
      <p
        className={cn(
          "text-[26px] leading-none font-semibold tracking-tight tabular-nums",
          tone === "caution" ? "text-caution" : tone === "positive" ? "text-sage" : "text-ink",
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-stone">{hint}</p>
    </article>
  );
}

function Bar({ part, whole, label }: { part: number; whole: number; label: string }) {
  const share = whole ? part / whole : 0;
  return (
    <div
      role="img"
      aria-label={label}
      title={whole ? `${Math.round(share * 100)}% on time` : "None due"}
      className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/[0.08]"
    >
      <div className="h-full rounded-full bg-sage" style={{ width: `${share * 100}%` }} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="rounded-[10px] bg-ink/[0.04] px-2 py-3 ring-1 ring-ink/10">
      <dd className={cn("text-xl font-semibold tabular-nums", tone === "danger" ? "text-danger" : "text-ink")}>{value}</dd>
      <dt className="mt-0.5 text-xs text-stone">{label}</dt>
    </div>
  );
}

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function formatGap(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours.toFixed(hours < 10 ? 1 : 0)} hours`;
}
