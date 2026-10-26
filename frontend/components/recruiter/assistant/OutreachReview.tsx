"use client";

import { ArrowLeft, CalendarClock, CalendarX2, Check, ChevronDown, CircleAlert, LoaderCircle, Mail, Send, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Frame, Superseded } from "@/components/recruiter/assistant/CardFrame";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { formatDayLabel, formatDuration, formatTime, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import type { ConfirmEdits, InterviewFormat, OutreachCard, OutreachItem } from "@/types/assistant";

const FORMATS: { value: InterviewFormat; label: string }[] = [
  { value: "video", label: "Video call" },
  { value: "phone", label: "Phone call" },
  { value: "onsite", label: "On-site" },
];

type Edit = { include: boolean; subject: string; body: string };

type OutreachReviewProps = {
  card: OutreachCard;
  /** Approve, with the recruiter's edits: runs once. */
  onConfirm: (actionId: string, edits: ConfirmEdits) => Promise<unknown>;
  onCancel: (actionId: string) => Promise<unknown>;
  /** The recruiter changed the card: reported so a typed or spoken "yes" approves it as it is now. */
  onEdits?: (actionId: string, edits: ConfirmEdits) => void;
  /** A newer version of this proposal is further down the conversation. */
  superseded?: boolean;
};

/** "Tue, Nov 3, 1:00 PM–1:30 PM", in the viewer's own time zone. */
export function slotLabel(slot: { starts_at: string; ends_at: string }): string {
  return `${formatDayLabel(slot.starts_at)}, ${formatTime(slot.starts_at)}–${formatTime(slot.ends_at)}`;
}

/**
 * Personalized outreach to the candidates the recruiter picked: one draft each to review and edit, the
 * proposed interview times, and who's in. "Approve selected" shows one final look at the candidates,
 * messages and times together; only "Confirm & send" there sends anything or creates any interview.
 * Afterwards it says, for each candidate, exactly what happened and what didn't (no email, no calendar).
 */
export function OutreachReview({ card, onConfirm, onCancel, onEdits, superseded = false }: OutreachReviewProps) {
  const id = useId();
  const [edits, setEdits] = useState<Record<string, Edit>>(() =>
    Object.fromEntries(card.items.map((item) => [item.candidate.application_id, { include: item.include, subject: item.subject, body: item.body }])),
  );
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<"review" | "final">(card.stage === "final" ? "final" : "review");
  const [replies, setReplies] = useState(card.enable_replies);
  const [interviewers, setInterviewers] = useState(card.schedule?.interviewers.join(", ") ?? "");
  const [meetingUrl, setMeetingUrl] = useState(card.schedule?.meeting_url ?? "");
  const [format, setFormat] = useState<InterviewFormat>(card.schedule?.interview_type ?? "video");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string>();
  // Only what the recruiter changed is reported, never a card's first state (an older copy could undo newer edits).
  const edited = useRef(false);
  const change = <T,>(set: (value: T) => void) => (value: T) => {
    edited.current = true;
    set(value);
  };
  const live = card.status === "proposed" && !superseded;
  useEffect(() => {
    if (edited.current && live) onEdits?.(card.action_id, asEdits(card, { edits, replies, interviewers, meetingUrl, format }));
  }, [card, edits, replies, interviewers, meetingUrl, format, live, onEdits]);

  const label = `${pluralize(card.items.length, "personalized draft")}`;
  if (superseded) return <Superseded label={label} />;

  const done = card.stage === "done" || card.status === "completed" || card.status === "failed";
  const cancelled = card.status === "cancelled";
  const chosen = card.items.filter((item) => edits[item.candidate.application_id]?.include);
  const closedReplies = chosen.filter((item) => !item.replies_open);
  const linkError = meetingUrl.trim() && !/^https?:\/\//.test(meetingUrl.trim()) ? "Enter a full link, starting with https://." : undefined;
  const emptyFor = chosen.find((item) => {
    const edit = edits[item.candidate.application_id];
    return !edit.subject.trim() || !edit.body.trim();
  });
  const textError = emptyFor ? `${emptyFor.candidate.name.split(" ")[0]}'s message needs a subject and some text.` : undefined;
  const what = card.purpose === "Interview invitation" ? "interview invitation" : "message";

  async function confirm() {
    if (sending || chosen.length === 0 || linkError || textError) return;
    setSending(true);
    setProblem(undefined);
    try {
      await onConfirm(card.action_id, asEdits(card, { edits, replies, interviewers, meetingUrl, format }));
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  const frameLabel = done
    ? card.status === "failed"
      ? "Some couldn't be sent"
      : `Sent · ${label}`
    : cancelled
      ? "Cancelled"
      : view === "final"
        ? "Final check · nothing sent yet"
        : label;

  return (
    <Frame label={frameLabel} tone={done ? (card.status === "failed" ? "failed" : "done") : "neutral"}>
      {card.schedule && <ScheduleSummary card={card} />}

      {done ? (
        <ul className="mt-3 flex flex-col gap-2">
          {card.items.map((item) => (
            <ResultRow key={item.candidate.application_id} item={item} emailConfigured={card.email_configured} />
          ))}
        </ul>
      ) : view === "final" ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[13px] text-charcoal">
            {chosen.length
              ? `You're about to send ${pluralize(chosen.length, `personalized ${what}`)}${card.schedule ? ` and create ${pluralize(chosen.filter((item) => item.slot).length, "interview")} in TalentBridge` : ""}:`
              : "Nobody is ticked, so nothing would be sent."}
          </p>
          <ul className="flex flex-col gap-2">
            {chosen.map((item) => {
              const edit = edits[item.candidate.application_id];
              return (
                <li key={item.candidate.application_id} className="rounded-[10px] bg-overlay px-3.5 py-2.5 ring-1 ring-border">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium text-ink">{item.candidate.name}</span>
                    <span className="text-xs text-stone">
                      {item.candidate.job_title} · {item.company_name}
                    </span>
                    {item.slot && (
                      <span className="text-xs text-charcoal" suppressHydrationWarning>
                        <CalendarClock aria-hidden className="mr-1 inline size-3.5 align-[-2px]" />
                        {slotLabel(item.slot)}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs font-medium text-charcoal">{edit.subject}</p>
                  <p className="mt-0.5 line-clamp-3 text-xs whitespace-pre-wrap text-stone">{edit.body}</p>
                </li>
              );
            })}
          </ul>
          <Notes card={card} replies={replies} closedReplies={closedReplies.length} />
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {card.items.map((item) => {
            const key = item.candidate.application_id;
            const edit = edits[key];
            const expanded = open === key;
            return (
              <li key={key} className={cn("rounded-[10px] ring-1 ring-border", edit.include ? "bg-overlay" : "bg-transparent opacity-70")}>
                <div className="flex items-start gap-2.5 px-3 py-2.5">
                  <Checkbox
                    className="mt-0.5"
                    checked={edit.include}
                    disabled={cancelled}
                    onCheckedChange={change((value) => setEdits((all) => ({ ...all, [key]: { ...edit, include: value === true } })))}
                    aria-label={`Include ${item.candidate.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-medium text-ink">{item.candidate.name}</span>
                      <span className="text-xs text-stone">
                        {item.candidate.job_title} · {item.company_name}
                      </span>
                      <StatusBadge stage={item.candidate.stage} />
                    </p>
                    {item.slot ? (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-charcoal" suppressHydrationWarning>
                        <CalendarClock aria-hidden className="size-3.5 text-stone" /> Proposed: {slotLabel(item.slot)}
                      </p>
                    ) : (
                      card.schedule && <p className="mt-1 text-xs text-caution">No time fits in the window: the draft asks for times.</p>
                    )}
                    {!expanded && <p className="mt-1 line-clamp-2 text-xs text-stone">{edit.body}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={expanded}
                    aria-controls={`${id}-${key}`}
                    onClick={() => setOpen(expanded ? null : key)}
                  >
                    {expanded ? "Done" : "Review"} <ChevronDown aria-hidden className={cn("transition-transform", expanded && "rotate-180")} />
                  </Button>
                </div>
                {expanded && (
                  <div id={`${id}-${key}`} className="flex flex-col gap-2 border-t border-border px-3 py-3">
                    <label className="text-xs text-stone" htmlFor={`${id}-${key}-subject`}>
                      Subject
                    </label>
                    <Input
                      id={`${id}-${key}-subject`}
                      value={edit.subject}
                      maxLength={200}
                      onChange={change((event) => setEdits((all) => ({ ...all, [key]: { ...edit, subject: event.target.value } })))}
                      className="h-8 text-[13px]"
                    />
                    <label className="text-xs text-stone" htmlFor={`${id}-${key}-body`}>
                      Message to {item.candidate.name.split(" ")[0]}
                    </label>
                    <Textarea
                      id={`${id}-${key}-body`}
                      value={edit.body}
                      maxLength={5000}
                      onChange={change((event) => setEdits((all) => ({ ...all, [key]: { ...edit, body: event.target.value } })))}
                      className="field-sizing-content max-h-80 min-h-36 text-[13px]"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!done && !cancelled && view === "review" && card.schedule && (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-interviewers`} className="text-xs text-stone">
              Interviewers
            </label>
            <Input id={`${id}-interviewers`} value={interviewers} onChange={change((event) => setInterviewers(event.target.value))} className="h-8 text-[13px]" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-format`} className="text-xs text-stone">
              Format
            </label>
            <Select id={`${id}-format`} value={format} onChange={change((event) => setFormat(event.target.value as InterviewFormat))} className="h-8 text-[13px]">
              {FORMATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-link`} className="text-xs text-stone">
              Meeting link (optional)
            </label>
            <Input
              id={`${id}-link`}
              type="url"
              inputMode="url"
              placeholder="https://"
              value={meetingUrl}
              aria-invalid={linkError ? true : undefined}
              onChange={change((event) => setMeetingUrl(event.target.value))}
              className="h-8 text-[13px]"
            />
          </div>
          <p className="text-[11px] text-faint sm:col-span-3">
            {linkError ?? "No video link is created for you: video meetings aren't connected. Add one, or send it later."}
          </p>
        </div>
      )}

      {!done && !cancelled && view === "review" && <Notes card={card} replies={replies} closedReplies={closedReplies.length} onReplies={change(setReplies)} />}

      {!done && !cancelled && textError && <p className="mt-2 text-xs text-danger">{textError}</p>}
      {(problem || card.error) && <p className="mt-2 text-xs text-danger">{problem ?? card.error}</p>}

      {!done && !cancelled && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={sending} onClick={() => void onCancel(card.action_id)}>
            <X aria-hidden /> Cancel
          </Button>
          {view === "review" ? (
            <Button size="sm" disabled={chosen.length === 0 || Boolean(linkError) || Boolean(textError)} onClick={() => setView("final")}>
              <Check aria-hidden /> Approve selected ({chosen.length})
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" disabled={sending} onClick={() => setView("review")}>
                <ArrowLeft aria-hidden /> Back
              </Button>
              <Button size="sm" disabled={sending || chosen.length === 0 || Boolean(textError)} onClick={() => void confirm()}>
                {sending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Send aria-hidden />}
                {sending ? "Sending…" : "Confirm & send"}
              </Button>
            </>
          )}
        </div>
      )}
    </Frame>
  );
}

/** The card as the recruiter has it: who's in, each changed subject and message, replies, the interview details. */
function asEdits(
  card: OutreachCard,
  state: { edits: Record<string, Edit>; replies: boolean; interviewers: string; meetingUrl: string; format: InterviewFormat },
): ConfirmEdits {
  return {
    items: card.items.map((item) => {
      const edit = state.edits[item.candidate.application_id];
      // Only what will be sent: a draft left out keeps its text as it was.
      return {
        application_id: item.candidate.application_id,
        include: edit.include,
        ...(edit.include && edit.subject.trim() && edit.subject !== item.subject ? { subject: edit.subject } : {}),
        ...(edit.include && edit.body.trim() && edit.body !== item.body ? { body: edit.body } : {}),
      };
    }),
    enable_replies: state.replies,
    ...(card.schedule
      ? {
          schedule: {
            interview_type: state.format,
            interviewers: state.interviewers.split(",").map((name) => name.trim()).filter(Boolean),
            meeting_url: state.meetingUrl.trim() || null,
          },
        }
      : {}),
  };
}

function ScheduleSummary({ card }: { card: OutreachCard }) {
  const plan = card.schedule;
  if (!plan) return null;
  const slots = card.items.flatMap((item) => (item.slot ? [item.slot] : []));
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-charcoal" suppressHydrationWarning>
        <CalendarClock aria-hidden className="size-4 text-stone" />
        <span className="font-medium text-ink">Interview invitation preview</span>
        <span>
          {plan.title} · {formatDuration(plan.duration_minutes)}
          {slots.length > 0 && ` · ${formatDayLabel(slots[0].starts_at)}, ${formatTime(slots[0].starts_at)}–${formatTime(slots.at(-1)!.ends_at)}`}
        </span>
      </p>
      {!plan.calendar_configured && (
        <p className="flex items-center gap-1.5 rounded-[8px] bg-caution/[0.08] px-2.5 py-1.5 text-xs text-caution ring-1 ring-caution/20">
          <CalendarX2 aria-hidden className="size-3.5 shrink-0" /> {plan.calendar_note}
        </p>
      )}
    </div>
  );
}

function Notes({
  card,
  replies,
  closedReplies,
  onReplies,
}: {
  card: OutreachCard;
  replies: boolean;
  closedReplies: number;
  onReplies?: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="mt-3 flex flex-col gap-1.5 text-xs text-stone">
      <p className="flex items-center gap-1.5">
        <Mail aria-hidden className="size-3.5" /> {card.delivery_note}
      </p>
      {closedReplies > 0 &&
        (onReplies ? (
          <label htmlFor={id} className="flex items-center gap-2 text-charcoal">
            <Checkbox id={id} checked={replies} onCheckedChange={(value) => onReplies(value === true)} />
            Turn on candidate messaging for {pluralize(closedReplies, "candidate")} who can&apos;t reply yet, so they can answer
          </label>
        ) : (
          <p>
            {replies
              ? `Candidate messaging will be turned on for ${pluralize(closedReplies, "candidate")}, so they can reply.`
              : `${pluralize(closedReplies, "candidate")} can't reply in the portal: candidate messaging stays off.`}
          </p>
        ))}
      {closedReplies > 0 && !replies && (
        <p className="text-caution">Check those messages don&apos;t ask for a reply: they can&apos;t write back while messaging is off.</p>
      )}
      <p className="text-faint">Nothing is sent or scheduled until you confirm.</p>
    </div>
  );
}

function ResultRow({ item, emailConfigured }: { item: OutreachItem; emailConfigured: boolean }) {
  const result = item.result;
  if (!item.include || !result) {
    return <li className="text-xs text-faint">{item.candidate.name}: left out, nothing sent</li>;
  }
  const delivery =
    result.email === "sent"
      ? "Emailed and in their portal"
      : result.email === "failed"
        ? "In their portal; the email failed"
        : emailConfigured
          ? "In their portal; email on its way"
          : "Portal delivered — Email not configured";
  return (
    <li className="rounded-[10px] bg-overlay px-3.5 py-2.5 ring-1 ring-border">
      <p className="text-sm font-medium text-ink">{item.candidate.name}</p>
      <ul className="mt-1 flex flex-col gap-0.5 text-xs">
        {result.message_sent ? (
          <li className="flex items-center gap-1.5 text-sage">
            <Check aria-hidden className="size-3.5" /> Message sent · {delivery}
          </li>
        ) : (
          <li className="flex items-center gap-1.5 text-danger">
            <CircleAlert aria-hidden className="size-3.5" /> Not sent: {result.error}
          </li>
        )}
        {result.interview_created && (
          <li className="flex items-center gap-1.5 text-sage" suppressHydrationWarning>
            <Check aria-hidden className="size-3.5" />
            {result.calendar === "created"
              ? "Interview created and calendar invite sent"
              : "Interview created in TalentBridge — Calendar invite not sent"}
            {item.slot && ` · ${slotLabel(item.slot)}`}
          </li>
        )}
        {result.messaging_enabled && (
          <li className="flex items-center gap-1.5 text-charcoal">
            <Check aria-hidden className="size-3.5" /> Candidate messaging turned on
          </li>
        )}
      </ul>
    </li>
  );
}
