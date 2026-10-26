"use client";

import { CircleCheck, ExternalLink, LoaderCircle, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button, buttonStyles } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { WEEKDAYS, dayLabel, type Weekday } from "@/lib/days";
import { jobFacts } from "@/lib/simple-hire";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import type { EmploymentType, JobDraft, JobDraftCard } from "@/types/assistant";

type Props = {
  card: JobDraftCard;
  onPost: (draft: JobDraft) => Promise<unknown>;
  onEdits: (draft: JobDraft) => void;
  busy: boolean;
  superseded: boolean;
};

const EMPLOYMENT: EmploymentType[] = ["Part-time", "Full-time", "Temporary", "Contract"];

/**
 * Simple Hire's job draft: "Ready to post", the few facts the owner said, and two buttons. Edit opens a short
 * form of the same facts; more is there only if they ask for it. Nothing is posted until Post Job.
 */
export function SimpleJobCard({ card, onPost, onEdits, busy, superseded }: Props) {
  const [draft, setDraft] = useState<JobDraft>(card.draft);
  const [editing, setEditing] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const created = card.stage === "created";
  const closed = superseded || card.status === "cancelled" || card.status === "failed";

  function change(update: Partial<JobDraft>) {
    const next = { ...draft, ...update };
    setDraft(next);
    onEdits(next);
  }

  async function post() {
    setPosting(true);
    setError(null);
    try {
      await onPost(draft);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPosting(false);
    }
  }

  if (created) {
    return (
      <div className="mt-3 rounded-[16px] border border-sage/30 bg-sage/[0.06] p-5">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-sage">
          <CircleCheck aria-hidden className="size-5" /> Posted
        </p>
        <p className="mt-1 text-lg font-semibold text-ink">{card.draft.title}</p>
        <p className="mt-1 text-sm text-stone">It&apos;s on your careers page, taking applications.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {card.careers_href && (
            <Link
              href={card.careers_href}
              target="_blank"
              className={buttonStyles({ variant: "secondary", size: "lg" })}
            >
              See it <ExternalLink aria-hidden />
            </Link>
          )}
          <Link href="/hire/jobs" className={buttonStyles({ variant: "ghost", size: "lg" })}>
            Your jobs
          </Link>
        </div>
      </div>
    );
  }

  const facts = jobFacts(draft);
  return (
    <div className={cn("mt-3 rounded-[16px] border border-border bg-surface-raised p-5", closed && "opacity-60")}>
      <p className="text-[13px] font-semibold text-brand-ink">
        {card.status === "cancelled" ? "Not posted" : superseded ? "Changed below" : "Ready to post"}
      </p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-ink">{draft.title}</p>
      {facts.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="The job">
          {facts.map((fact) => (
            <li key={fact} className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-charcoal">
              {fact}
            </li>
          ))}
        </ul>
      )}
      {(draft.location || draft.requirements.length > 0) && (
        <dl className="mt-3 flex flex-col gap-1 text-sm text-stone">
          {draft.location && (
            <div className="flex gap-1.5">
              <dt className="font-medium text-charcoal">Where:</dt>
              <dd>{draft.location}</dd>
            </div>
          )}
          {draft.requirements.length > 0 && (
            <div className="flex gap-1.5">
              <dt className="font-medium text-charcoal">Looking for:</dt>
              <dd>{draft.requirements.join(", ")}</dd>
            </div>
          )}
        </dl>
      )}
      {card.missing.length > 0 && !closed && (
        <ul className="mt-3 flex flex-col gap-0.5 text-xs text-faint">
          {card.missing.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      {editing && !closed && (
        <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Job" htmlFor={`${card.action_id}-title`}>
              <Input
                id={`${card.action_id}-title`}
                value={draft.title}
                onChange={(e) => change({ title: e.target.value })}
              />
            </Field>
            <Field label="Pay" htmlFor={`${card.action_id}-pay`}>
              <Input
                id={`${card.action_id}-pay`}
                placeholder="$18/hour"
                value={draft.pay ?? ""}
                onChange={(e) => change({ pay: e.target.value || null })}
              />
            </Field>
            <Field label="Shift" htmlFor={`${card.action_id}-shift`}>
              <Input
                id={`${card.action_id}-shift`}
                placeholder="Evenings"
                value={draft.shift ?? ""}
                onChange={(e) => change({ shift: e.target.value || null })}
              />
            </Field>
            <Field label="How many people" htmlFor={`${card.action_id}-openings`}>
              <Input
                id={`${card.action_id}-openings`}
                type="number"
                min={1}
                max={500}
                value={draft.openings ?? ""}
                onChange={(e) => change({ openings: e.target.value ? Number(e.target.value) : null })}
              />
            </Field>
          </div>
          <fieldset>
            <legend className="text-xs font-medium text-charcoal">Days</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => {
                const on = (draft.work_days ?? []).includes(day);
                return (
                  <label
                    key={day}
                    className={cn(
                      "cursor-pointer rounded-full border px-3 py-1.5 text-sm has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand/55",
                      on ? "border-brand-ink bg-brand-soft text-ink" : "border-border text-charcoal",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() =>
                        change({
                          work_days: on
                            ? (draft.work_days ?? []).filter((each) => each !== day)
                            : WEEKDAYS.filter(
                                (each) => each === day || (draft.work_days ?? []).includes(each as Weekday),
                              ),
                        })
                      }
                    />
                    {dayLabel(day).slice(0, 3)}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Where" htmlFor={`${card.action_id}-location`}>
              <Input
                id={`${card.action_id}-location`}
                value={draft.location ?? ""}
                onChange={(e) => change({ location: e.target.value || null })}
              />
            </Field>
            <Field label="Looking for (separate with commas)" htmlFor={`${card.action_id}-needs`}>
              <Input
                id={`${card.action_id}-needs`}
                value={draft.requirements.join(", ")}
                onChange={(e) => {
                  const needs = e.target.value
                    .split(",")
                    .map((need) => need.trim())
                    .filter(Boolean);
                  change({ requirements: needs, skills: needs });
                }}
              />
            </Field>
          </div>
          {advanced ? (
            <div className="grid grid-cols-1 gap-3">
              <Field label="Full-time or part-time" htmlFor={`${card.action_id}-type`}>
                <Select
                  id={`${card.action_id}-type`}
                  value={draft.employment_type}
                  onChange={(e) => change({ employment_type: e.target.value as EmploymentType })}
                >
                  {EMPLOYMENT.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </Select>
              </Field>
              <Field label="What applicants see first" htmlFor={`${card.action_id}-summary`}>
                <Textarea
                  id={`${card.action_id}-summary`}
                  rows={3}
                  value={draft.summary ?? ""}
                  onChange={(e) => change({ summary: e.target.value || null })}
                />
              </Field>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdvanced(true)}
              className="self-start text-sm font-medium text-brand-ink underline-offset-4 hover:underline"
            >
              More details
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {!closed && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="lg" onClick={() => void post()} disabled={busy || posting || !draft.title.trim()}>
            {posting && <LoaderCircle aria-hidden className="animate-spin" />}
            {posting ? "Posting…" : "Post Job"}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setEditing((open) => !open)} aria-expanded={editing}>
            <Pencil aria-hidden />
            {editing ? "Done editing" : "Edit"}
          </Button>
        </div>
      )}
    </div>
  );
}
