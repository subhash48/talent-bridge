"use client";

import { CalendarClock, CircleCheck, CircleX, LoaderCircle, Pencil, Send } from "lucide-react";
import { useState } from "react";

import { slotLabel } from "@/components/recruiter/assistant/OutreachReview";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { calendarDayLabel, clockLabel } from "@/lib/days";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import type { ConfirmEdits, OutreachCard, OutreachItem } from "@/types/assistant";

type Props = {
  card: OutreachCard;
  onSend: (edits: ConfirmEdits) => Promise<unknown>;
  onEdits: (edits: ConfirmEdits) => void;
  busy: boolean;
  superseded: boolean;
};

type Draft = { include: boolean; body: string };

/**
 * Messages to applicants, one each, for the owner to read before anything goes: who, the interview time when
 * they're being asked to come in, and the words. Untick someone to leave them out; Edit changes the words;
 * Send sends exactly what's shown. Nothing is sent from here otherwise.
 */
export function SimpleOutreachCard({ card, onSend, onEdits, busy, superseded }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      card.items.map((item) => [item.candidate.application_id, { include: item.include, body: item.body }]),
    ),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = card.stage === "done" || card.status === "completed" || card.status === "failed";
  const closed = superseded || card.status === "cancelled";
  const chosen = card.items.filter((item) => drafts[item.candidate.application_id]?.include);
  const asking = card.schedule !== null;

  function edits(next: Record<string, Draft>): ConfirmEdits {
    return {
      items: card.items.map((item) => ({
        application_id: item.candidate.application_id,
        include: next[item.candidate.application_id].include,
        body: next[item.candidate.application_id].body,
      })),
    };
  }

  function change(id: string, update: Partial<Draft>) {
    const next = { ...drafts, [id]: { ...drafts[id], ...update } };
    setDrafts(next);
    onEdits(edits(next));
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      await onSend(edits(drafts));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={cn("mt-3 rounded-[16px] border border-border bg-surface-raised", closed && "opacity-60")}>
      <div className="border-b border-border px-4 py-3">
        <p className="text-[15px] font-semibold text-ink">
          {done ? "Sent" : asking ? "Interview requests to send" : "Messages to send"}
        </p>
        {card.schedule && (
          <p className="mt-1 flex items-start gap-1.5 text-sm text-stone">
            <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0" />
            {card.schedule.day ? `${calendarDayLabel(card.schedule.day)}, ` : ""}
            between {clockLabel(card.schedule.window_start)} and {clockLabel(card.schedule.window_end)}
            {!card.schedule.calendar_configured &&
              ". No calendar is connected: TalentBridge records each interview and messages them."}
          </p>
        )}
      </div>
      <ul className="divide-y divide-border">
        {card.items.map((item) => (
          <ItemRow
            key={item.candidate.application_id}
            item={item}
            draft={drafts[item.candidate.application_id]}
            done={done}
            disabled={closed || busy || sending}
            editing={editing === item.candidate.application_id}
            onEdit={() =>
              setEditing((open) => (open === item.candidate.application_id ? null : item.candidate.application_id))
            }
            onChange={(update) => change(item.candidate.application_id, update)}
          />
        ))}
      </ul>
      {error && <p className="px-4 pt-3 text-sm text-danger">{error}</p>}
      {!done && !closed && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <p className="text-xs text-faint">{card.delivery_note}</p>
          <Button size="lg" onClick={() => void send()} disabled={busy || sending || chosen.length === 0}>
            {sending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Send aria-hidden />}
            {sending ? "Sending…" : `Send ${pluralize(chosen.length, "message")}`}
          </Button>
        </div>
      )}
    </div>
  );
}

type RowProps = {
  item: OutreachItem;
  draft: Draft;
  done: boolean;
  disabled: boolean;
  editing: boolean;
  onEdit: () => void;
  onChange: (update: Partial<Draft>) => void;
};

function ItemRow({ item, draft, done, disabled, editing, onEdit, onChange }: RowProps) {
  const result = item.result;
  return (
    <li className={cn("flex flex-col gap-2 p-4", !draft.include && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3">
        {!done && (
          <input
            type="checkbox"
            checked={draft.include}
            disabled={disabled}
            onChange={(event) => onChange({ include: event.target.checked })}
            className="size-5 accent-[var(--color-brand-ink)]"
            aria-label={`Send to ${item.candidate.name}`}
          />
        )}
        <span className="flex-1 text-base font-semibold text-ink">{item.candidate.name}</span>
        {item.slot && <span className="text-sm font-medium text-brand-ink">{slotLabel(item.slot)}</span>}
        {done && result && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-sm font-medium",
              result.message_sent ? "text-sage" : "text-danger",
            )}
          >
            {result.message_sent ? (
              <CircleCheck aria-hidden className="size-4" />
            ) : (
              <CircleX aria-hidden className="size-4" />
            )}
            {result.message_sent
              ? result.interview_created
                ? "Sent, interview booked"
                : "Sent"
              : result.error || "Not sent"}
          </span>
        )}
      </div>
      {editing && !done ? (
        <Textarea
          value={draft.body}
          rows={5}
          onChange={(event) => onChange({ body: event.target.value })}
          aria-label={`Message to ${item.candidate.name}`}
        />
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-line text-charcoal">{draft.body}</p>
      )}
      {!done && (
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-brand-ink underline-offset-4 hover:underline"
        >
          <Pencil aria-hidden className="size-3.5" /> {editing ? "Done" : "Edit message"}
        </button>
      )}
    </li>
  );
}
