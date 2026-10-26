"use client";

import { ArrowRight, CalendarClock, Inbox, LoaderCircle, Pencil, Send, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ContactsCard } from "@/components/recruiter/assistant/ContactsCard";
import { CandidateMatchList } from "@/components/recruiter/assistant/CandidateMatchList";
import { Chips, Frame, Superseded } from "@/components/recruiter/assistant/CardFrame";
import { JobDraftReview } from "@/components/recruiter/assistant/JobDraftReview";
import { OutreachReview } from "@/components/recruiter/assistant/OutreachReview";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Textarea } from "@/components/ui/Textarea";
import { formatDateTime, formatDuration, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import type {
  AssistantCard,
  ClarifyCard,
  ConfirmEdits,
  FollowUpListCard,
  InterviewInfoCard,
  MessageCard,
} from "@/types/assistant";

export type CardActions = {
  /** Run a proposal once, with the recruiter's edits: send the message or the outreach, create the job. */
  onConfirm: (actionId: string, edits?: ConfirmEdits) => Promise<unknown>;
  onCancel: (actionId: string, card: AssistantCard) => Promise<unknown>;
  /** Ask the assistant something next, e.g. "Draft Sophia an update" or a clarification choice. */
  onSend: (text: string, context?: { application_id?: string | null }) => void;
  /** The recruiter ticked candidates in a list. */
  onSelect: (ids: string[]) => void;
  /** The recruiter changed a proposal's card, so a typed or spoken "yes" approves it as it is now. */
  onEdits: (actionId: string, edits: ConfirmEdits) => void;
  busy: boolean;
};

/** superseded: a newer version of this card (the same proposal) is further down the conversation. */
export function AssistantCardView({ card, actions, superseded = false }: { card: AssistantCard; actions: CardActions; superseded?: boolean }) {
  switch (card.type) {
    case "contacts":
      return <ContactsCard card={card} />;
    case "message":
      return <MessageProposal card={card} actions={actions} superseded={superseded} />;
    case "follow_ups":
      return <FollowUpList card={card} actions={actions} />;
    case "clarify":
      return <Clarify card={card} actions={actions} />;
    case "interview":
      return <InterviewInfo card={card} />;
    case "candidate_match":
      return <CandidateMatchList card={card} onSelect={actions.onSelect} superseded={superseded} />;
    case "outreach":
      return (
        <OutreachReview
          card={card}
          superseded={superseded}
          onConfirm={(actionId, edits) => actions.onConfirm(actionId, edits)}
          onCancel={(actionId) => actions.onCancel(actionId, card)}
          onEdits={actions.onEdits}
        />
      );
    case "job_draft":
      return (
        <JobDraftReview
          card={card}
          superseded={superseded}
          onApprove={(actionId, draft) => actions.onConfirm(actionId, { job: draft })}
          onCancel={(actionId) => actions.onCancel(actionId, card)}
          onEdits={(actionId, draft) => actions.onEdits(actionId, { job: draft })}
        />
      );
  }
}

// Messages

function MessageProposal({ card, actions, superseded }: { card: MessageCard; actions: CardActions; superseded: boolean }) {
  const [mode, setMode] = useState(card.mode);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(card.body);
  const [replies, setReplies] = useState(card.enable_replies);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string>();
  const open = card.status === "proposed";
  const edited = useRef(false);
  const { onEdits } = actions;
  useEffect(() => {
    if (edited.current && open && !superseded) onEdits(card.action_id, { body, enable_replies: replies });
  }, [body, replies, open, superseded, card.action_id, onEdits]);

  if (superseded) return <Superseded label={`${card.purpose} for ${card.candidate.name}`} />;
  const first = card.candidate.name.split(" ")[0];

  async function confirm() {
    if (sending) return; // one click, one send
    setSending(true);
    setProblem(undefined);
    try {
      await actions.onConfirm(card.action_id, { ...(body !== card.body ? { body } : {}), enable_replies: replies });
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
            onChange={(event) => {
              edited.current = true;
              setBody(event.target.value);
            }}
            className="field-sizing-content max-h-80 min-h-40 text-[13px]"
          />
        </div>
      ) : (
        <p className="mt-3 rounded-[10px] bg-overlay px-3.5 py-3 text-[13px] leading-relaxed whitespace-pre-wrap text-charcoal ring-1 ring-border">
          {card.status === "completed" ? card.body : body}
        </p>
      )}
      {open && !card.replies_open && (
        <label htmlFor={`replies-${card.action_id}`} className="mt-3 flex items-center gap-2 text-xs text-charcoal">
          <Checkbox
            id={`replies-${card.action_id}`}
            checked={replies}
            onCheckedChange={(value) => {
              edited.current = true;
              setReplies(value === true);
            }}
          />
          Turn on candidate messaging so {first} can reply
        </label>
      )}
      {open && !card.replies_open && !replies && (
        <p className="mt-1 text-xs text-caution">{first} can&apos;t reply in the portal while messaging is off: check the message doesn&apos;t ask for a reply.</p>
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

// Lists and answers

function FollowUpList({ card, actions }: { card: FollowUpListCard; actions: CardActions }) {
  return (
    <Frame label={`${card.title} · ${card.total}`}>
      {card.items.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {card.items.slice(0, 8).map((item) => (
            <li key={`${item.candidate.application_id}-${item.at ?? ""}`} className="flex items-center justify-between gap-3 py-2">
              <Link href={`/recruiter/candidates?candidate=${item.candidate.application_id}`} className="min-w-0 text-sm hover:text-ink">
                <span className="block truncate font-medium text-ink">{item.candidate.name}</span>
                <span className="block truncate text-xs text-stone" suppressHydrationWarning>
                  {[item.reason, item.detail, item.at ? formatDateTime(item.at) : item.since ? formatRelativeTime(item.since) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
              <Button
                size="sm"
                variant="ai"
                disabled={actions.busy}
                onClick={() =>
                  actions.onSend(`Draft ${item.candidate.name.split(" ")[0]} an update`, {
                    application_id: item.candidate.application_id,
                  })
                }
              >
                <Sparkles aria-hidden /> Draft
              </Button>
            </li>
          ))}
        </ul>
      )}
      {card.total > 8 && <p className="mt-2 text-xs text-faint">And {card.total - 8} more.</p>}
      <Link href={card.href} className={cn(buttonStyles({ variant: "secondary", size: "sm" }), "mt-3")}>
        <Inbox aria-hidden /> Open Today
      </Link>
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
            className="rounded-[10px] border border-border bg-surface-raised px-3.5 py-2.5 text-left transition-[background-color,border-color] duration-200 hover:border-brand-ink/35 hover:bg-brand-soft disabled:opacity-50"
          >
            <span className="block text-sm font-medium text-ink">{option.label}</span>
            <span className="block text-xs text-stone">{option.detail}</span>
          </button>
        ))}
      </div>
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
