"use client";

import { CalendarPlus, Check, MessageCircle, Minus, Phone } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatRelativeTime, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CandidateMatchCard } from "@/types/assistant";

type Props = {
  card: CandidateMatchCard;
  onSelect: (ids: string[]) => void;
  onAsk: (text: string) => void;
  busy: boolean;
};

const WHEN = [
  { label: "Tomorrow afternoon", say: "tomorrow afternoon" },
  { label: "Tuesday between 2 and 5", say: "Tuesday between 2 and 5" },
];

/**
 * Applicants with the reasons each one matches what the owner asked for: "✓ Kitchen experience", "✓ Friday
 * available", in the applicant's own words where that's where it was found. No score, nothing hidden: the
 * owner ticks who to contact, then says what to do, or presses one of the buttons, which say it for them.
 */
export function SimpleApplicantsCard({ card, onSelect, onAsk, busy }: Props) {
  const [when, setWhen] = useState("");
  const [asking, setAsking] = useState(false);
  const selected = new Set(card.selected);
  const chosen = card.items.filter((item) => selected.has(item.application_id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelect(card.items.map((item) => item.application_id).filter((each) => next.has(each)));
  }

  if (card.items.length === 0) {
    return (
      <p className="mt-3 rounded-[14px] border border-border bg-surface-raised p-4 text-sm text-stone">
        Nobody fits that yet. Try fewer requirements, or ask again once more people have applied.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-[16px] border border-border bg-surface-raised">
      <ul className="divide-y divide-border">
        {card.items.map((item) => {
          const on = selected.has(item.application_id);
          return (
            <li key={item.application_id}>
              <label className={cn("flex cursor-pointer gap-3 p-4 transition-colors", on && "bg-brand-soft/50")}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(item.application_id)}
                  className="mt-1 size-5 shrink-0 accent-[var(--color-brand-ink)]"
                  aria-label={`Choose ${item.name}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-base font-semibold text-ink">{item.name}</span>
                    <span className="text-xs text-faint">
                      {item.job_title} · applied {formatRelativeTime(item.applied_at)}
                    </span>
                  </span>
                  {item.evidence.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1" aria-label={`Why ${item.name} matches`}>
                      {item.evidence.map((reason) => (
                        <li
                          key={`${reason.kind ?? "criterion"}:${reason.criterion}`}
                          className={cn(
                            "flex items-start gap-2 text-sm",
                            reason.matched ? "text-charcoal" : "text-faint",
                          )}
                        >
                          {reason.matched ? (
                            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-sage" strokeWidth={2.5} />
                          ) : (
                            <Minus aria-hidden className="mt-0.5 size-4 shrink-0" />
                          )}
                          <span>
                            <span className="sr-only">{reason.matched ? "Yes: " : "No: "}</span>
                            {reason.label || reason.criterion}
                            {reason.quote && <span className="text-stone"> — &ldquo;{reason.quote}&rdquo;</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-3 border-t border-border p-4">
        <p className="text-sm text-stone" aria-live="polite">
          {chosen.length
            ? `${pluralize(chosen.length, "person", "people")} chosen. What would you like to do?`
            : "Tick the people you'd like to contact."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="lg"
            disabled={busy || !chosen.length}
            onClick={() => onAsk("Show me their phone numbers")}
          >
            <Phone aria-hidden /> Phone numbers
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={busy || !chosen.length}
            onClick={() => onAsk("Message these applicants")}
          >
            <MessageCircle aria-hidden /> Message them
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={busy || !chosen.length}
            onClick={() => setAsking((open) => !open)}
            aria-expanded={asking}
          >
            <CalendarPlus aria-hidden /> Ask to interview
          </Button>
        </div>
        {asking && chosen.length > 0 && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (when.trim()) onAsk(`Ask them if they can come in ${when.trim()}`);
            }}
          >
            <label htmlFor={`when-${card.href}`} className="text-sm font-medium text-ink">
              When could they come in?
            </label>
            <div className="flex flex-wrap gap-2">
              {WHEN.map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  onClick={() => onAsk(`Ask them if they can come in ${choice.say}`)}
                  disabled={busy}
                  className="rounded-full border border-border px-3 py-1.5 text-sm text-charcoal hover:border-brand-ink/40 hover:bg-brand-soft"
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                id={`when-${card.href}`}
                value={when}
                onChange={(event) => setWhen(event.target.value)}
                placeholder="For example: Thursday morning"
                className="h-11 text-base"
              />
              <Button type="submit" size="lg" disabled={busy || !when.trim()}>
                Ask
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
