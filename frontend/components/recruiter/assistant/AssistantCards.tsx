"use client";

import { ArrowRight, BarChart3, BriefcaseBusiness, CalendarClock, Check, CircleAlert, ExternalLink, LoaderCircle, Pencil, Send, X } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { formatDateTime, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import type {
  AnalyticsCard,
  AssistantCard,
  CandidateListCard,
  ClarifyCard,
  InterviewInfoCard,
  JobCard,
  JobListCard,
  MessageCard,
} from "@/types/assistant";

export type CardActions = {
  /** Run a proposal once: send the message (with edits) or publish the job. */
  onConfirm: (actionId: string, body?: string) => Promise<unknown>;
  onCancel: (actionId: string, card: AssistantCard) => Promise<unknown>;
  /** Ask the assistant something next, e.g. "Publish the job" or a clarification choice. */
  onSend: (text: string, context?: { application_id?: string | null }) => void;
  busy: boolean;
};

export function AssistantCardView({ card, actions }: { card: AssistantCard; actions: CardActions }) {
  switch (card.type) {
    case "message":
      return <MessageProposal card={card} actions={actions} />;
    case "job":
      return <JobProposal card={card} actions={actions} />;
    case "candidates":
      return <CandidateList card={card} />;
    case "jobs":
      return <JobList card={card} />;
    case "clarify":
      return <Clarify card={card} actions={actions} />;
    case "analytics":
      return <AnalyticsAnswer card={card} />;
    case "interview":
      return <InterviewInfo card={card} />;
  }
}

function Frame({ label, tone = "neutral", children }: { label: string; tone?: "neutral" | "done" | "failed"; children: ReactNode }) {
  return (
    <div className="mt-2.5 animate-rise rounded-[12px] border border-border bg-ink/[0.025] p-3.5 sm:p-4">
      <p
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase",
          tone === "done" ? "text-sage" : tone === "failed" ? "text-danger" : "text-faint",
        )}
      >
        {tone === "done" && <Check aria-hidden className="size-3.5" strokeWidth={2.5} />}
        {tone === "failed" && <CircleAlert aria-hidden className="size-3.5" />}
        {label}
      </p>
      {children}
    </div>
  );
}

function Chips({ items }: { items: (string | null | undefined)[] }) {
  const shown = items.filter(Boolean) as string[];
  if (!shown.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {shown.map((item) => (
        <li key={item} className="inline-flex h-6 items-center rounded-full bg-ink/[0.05] px-2.5 text-xs text-charcoal ring-1 ring-ink/10">
          {item}
        </li>
      ))}
    </ul>
  );
}

// Messages

function MessageProposal({ card, actions }: { card: MessageCard; actions: CardActions }) {
  const [mode, setMode] = useState(card.mode);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(card.body);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string>();
  const open = card.status === "proposed";
  const first = card.candidate.name.split(" ")[0];

  async function confirm() {
    if (sending) return; // one click, one send
    setSending(true);
    setProblem(undefined);
    try {
      await actions.onConfirm(card.action_id, body !== card.body ? body : undefined);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  const label =
    card.status === "completed"
      ? `Sent to ${card.candidate.name}`
      : card.status === "failed"
        ? "Couldn't send"
        : card.status === "cancelled"
          ? "Cancelled"
          : mode === "draft"
            ? `${card.purpose} · draft`
            : "Ready to send";

  return (
    <Frame label={label} tone={card.status === "completed" ? "done" : card.status === "failed" ? "failed" : "neutral"}>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-sm font-medium text-ink">{card.candidate.name}</p>
        <span className="text-xs text-stone">{card.candidate.job_title}</span>
      </div>
      <Chips items={[card.interview_type, card.duration_minutes ? formatDuration(card.duration_minutes) : null, card.timeframe]} />
      {editing && open ? (
        <div className="mt-3">
          <label htmlFor={`body-${card.action_id}`} className="sr-only">
            Message to {first}
          </label>
          <Textarea
            id={`body-${card.action_id}`}
            value={body}
            maxLength={5000}
            onChange={(event) => setBody(event.target.value)}
            className="field-sizing-content max-h-80 min-h-40 text-[13px]"
          />
        </div>
      ) : (
        <p className="mt-3 rounded-[10px] bg-canvas/60 px-3.5 py-3 text-[13px] leading-relaxed whitespace-pre-wrap text-charcoal ring-1 ring-border">
          {card.status === "completed" ? card.body : body}
        </p>
      )}
      <p className="mt-2 text-[11px] text-faint">Delivered to {first}&apos;s {card.delivery.toLowerCase()}. Nothing is sent until you confirm.</p>
      {(problem || card.error) && <p className="mt-2 text-xs text-danger">{problem ?? card.error}</p>}
      {open && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={sending} onClick={() => void actions.onCancel(card.action_id, card)}>
            <X aria-hidden /> Cancel
          </Button>
          <Button variant="secondary" size="sm" disabled={sending} onClick={() => setEditing((value) => !value)}>
            <Pencil aria-hidden /> {editing ? "Done editing" : "Edit"}
          </Button>
          {mode === "draft" ? (
            <Button size="sm" onClick={() => setMode("execute")}>
              Review &amp; send <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button size="sm" disabled={sending || !body.trim()} onClick={() => void confirm()}>
              {sending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Send aria-hidden />}
              {sending ? "Sending…" : "Confirm & Send"}
            </Button>
          )}
        </div>
      )}
    </Frame>
  );
}

// Jobs

const JOB_LABELS: Record<JobCard["stage"], string> = {
  draft_created: "Draft created",
  draft_updated: "Draft updated",
  ready_to_publish: "Job Ready",
  published: "Published",
};

function JobProposal({ card, actions }: { card: JobCard; actions: CardActions }) {
  const [publishing, setPublishing] = useState(false);
  const [problem, setProblem] = useState<string>();
  const { job } = card;
  const awaiting = card.stage === "ready_to_publish" && card.status === "proposed" && card.action_id;

  async function publish() {
    if (publishing || !card.action_id) return;
    setPublishing(true);
    setProblem(undefined);
    try {
      await actions.onConfirm(card.action_id);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setPublishing(false);
    }
  }

  const tone = card.status === "failed" ? "failed" : card.stage === "published" ? "done" : "neutral";
  return (
    <Frame label={card.status === "failed" ? "Couldn't publish" : card.status === "cancelled" ? "Cancelled" : JOB_LABELS[card.stage]} tone={tone}>
      <p className="mt-2 text-[15px] font-semibold tracking-tight text-ink">{job.title}</p>
      <p className="mt-0.5 text-xs text-stone">
        {[job.location, job.work_arrangement, job.seniority, job.salary].filter(Boolean).join(" · ") || job.employment_type}
      </p>
      <Chips items={job.skills.slice(0, 8)} />
      {card.changes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-charcoal">
          {card.changes.map((change) => (
            <li key={change} className="flex items-center gap-1.5">
              <Check aria-hidden className="size-3 text-sage" /> {change}
            </li>
          ))}
        </ul>
      )}
      {problem && <p className="mt-2 text-xs text-danger">{problem}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Link href={job.review_path} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <BriefcaseBusiness aria-hidden /> Review Job
        </Link>
        {card.stage === "published" ? (
          <a href={job.public_path} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <ExternalLink aria-hidden /> View careers page
          </a>
        ) : awaiting ? (
          <Button size="sm" disabled={publishing} onClick={() => void publish()}>
            {publishing && <LoaderCircle aria-hidden className="animate-spin" />}
            {publishing ? "Publishing…" : "Publish Job"}
          </Button>
        ) : (
          card.status !== "cancelled" &&
          job.status !== "published" && (
            <Button size="sm" variant="ai" disabled={actions.busy} onClick={() => actions.onSend("Publish the job")}>
              Get ready to publish <ArrowRight aria-hidden />
            </Button>
          )
        )}
      </div>
    </Frame>
  );
}

// Lists and answers

function CandidateList({ card }: { card: CandidateListCard }) {
  return (
    <Frame label={`${card.title} · ${card.total}`}>
      {card.items.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {card.items.slice(0, 8).map((item) => (
            <li key={item.application_id}>
              <Link
                href={`/recruiter/candidates/${item.application_id}`}
                className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:text-ink"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{item.name}</span>
                  <span className="block truncate text-xs text-stone">{item.job_title}</span>
                </span>
                <StatusBadge stage={item.stage} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {card.total > 8 && <p className="mt-2 text-xs text-faint">And {card.total - 8} more on the Candidates page.</p>}
    </Frame>
  );
}

function JobList({ card }: { card: JobListCard }) {
  return (
    <Frame label={`Open jobs · ${card.items.length}`}>
      <ul className="mt-2 divide-y divide-border">
        {card.items.map((job) => (
          <li key={job.id}>
            <Link href={`/recruiter/jobs/${job.id}`} className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:text-ink">
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{job.title}</span>
                {job.location && <span className="block truncate text-xs text-stone">{job.location}</span>}
              </span>
              <span className="shrink-0 text-xs text-stone tabular-nums">
                {job.candidates} {job.candidates === 1 ? "candidate" : "candidates"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function Clarify({ card, actions }: { card: ClarifyCard; actions: CardActions }) {
  return (
    <Frame label="Which one?">
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {card.options.map((option) => (
          <button
            key={`${option.label}-${option.application_id}`}
            type="button"
            disabled={actions.busy}
            onClick={() => actions.onSend(option.reply, { application_id: option.application_id })}
            className="rounded-[10px] border border-border bg-ink/[0.03] px-3.5 py-2.5 text-left transition-[background-color,border-color] duration-200 hover:border-ink/30 hover:bg-ink/[0.06] disabled:opacity-50"
          >
            <span className="block text-sm font-medium text-ink">{option.label}</span>
            <span className="block text-xs text-stone">{option.detail}</span>
          </button>
        ))}
      </div>
    </Frame>
  );
}

function AnalyticsAnswer({ card }: { card: AnalyticsCard }) {
  return (
    <Frame label={`${card.title} · ${card.period}`}>
      {card.rows.length > 0 && (
        <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-[13px]">
          {card.rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="truncate text-stone">{row.label}</dt>
              <dd className="text-right font-medium text-ink tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <Link href={card.href} className={cn(buttonStyles({ variant: "secondary", size: "sm" }), "mt-3")}>
        <BarChart3 aria-hidden /> Open Analytics
      </Link>
    </Frame>
  );
}

function InterviewInfo({ card }: { card: InterviewInfoCard }) {
  const { interview } = card;
  return (
    <Frame label={interview ? "Next interview" : "No interview scheduled"}>
      <p className="mt-2 text-sm font-medium text-ink">{card.candidate.name}</p>
      {interview && (
        <>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-charcoal" suppressHydrationWarning>
            <CalendarClock aria-hidden className="size-3.5 text-stone" />
            {interview.title} · {formatDateTime(interview.scheduled_at)}
          </p>
          <Chips
            items={[
              formatDuration(interview.duration_minutes),
              interview.interview_type,
              interview.confirmed ? "Confirmed" : "Not confirmed yet",
              ...interview.interviewers,
            ]}
          />
        </>
      )}
    </Frame>
  );
}
