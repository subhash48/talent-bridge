"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";

import { OutreachReview } from "@/components/recruiter/assistant/OutreachReview";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { pluralize } from "@/lib/format";
import { errorMessage } from "@/services/api";
import { cancelAction, confirmAction, draftOutreach } from "@/services/assistant";
import type { ConfirmEdits, OutreachCard, OutreachRequest } from "@/types/assistant";
import type { PipelineCandidate } from "@/types/workspace";

type OutreachDialogProps = {
  /** Only the candidates the recruiter ticked. */
  candidates: PipelineCandidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Approved: the outcome, sent or not, for each candidate. */
  onDone: (card: OutreachCard) => void;
};

/** The next weekday, as a date input's value. */
function nextWorkday(): string {
  const date = new Date();
  do date.setDate(date.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6);
  return isoDay(date);
}

function isoDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * "Draft personalized outreach" for the candidates ticked on the Candidates page: the same proposal the AI
 * Assistant makes, one draft per candidate, with interview times if asked for. It's reviewed, edited and
 * approved right here, and nothing is sent or scheduled before "Confirm & send".
 */
export function OutreachDialog({ candidates, open, onOpenChange, onDone }: OutreachDialogProps) {
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Draft personalized outreach"
      description={`One draft for each of the ${pluralize(candidates.length, "candidate")} you selected. You review every one before anything is sent.`}
      className="max-w-2xl"
    >
      {open && <OutreachForm candidates={candidates} onClose={() => onOpenChange(false)} onDone={onDone} />}
    </Modal>
  );
}

function OutreachForm({
  candidates,
  onClose,
  onDone,
}: {
  candidates: PipelineCandidate[];
  onClose: () => void;
  onDone: (card: OutreachCard) => void;
}) {
  const { refresh } = useWorkspace();
  const [purpose, setPurpose] = useState<OutreachRequest["purpose"]>("interview_invitation");
  const [instructions, setInstructions] = useState("");
  const [schedule, setSchedule] = useState(true);
  const [day, setDay] = useState(nextWorkday);
  const [from, setFrom] = useState("13:00");
  const [to, setTo] = useState("16:00");
  const [minutes, setMinutes] = useState("30");
  const [title, setTitle] = useState("First interview");
  const [drafting, setDrafting] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [card, setCard] = useState<OutreachCard | null>(null);

  async function draft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (drafting) return;
    setDrafting(true);
    setProblem(undefined);
    try {
      const response = await draftOutreach({
        application_ids: candidates.map((candidate) => candidate.id),
        purpose,
        instructions: instructions.trim() || undefined,
        schedule:
          purpose === "interview_invitation" && schedule
            ? { interview_type: title.trim() || "Interview", duration_minutes: Number(minutes), timeframe: day, window_start: from, window_end: to }
            : undefined,
      });
      const outreach = response.cards.find((item): item is OutreachCard => item.type === "outreach");
      if (!outreach) setProblem(response.reply);
      else setCard(outreach);
    } catch (error) {
      setProblem(errorMessage(error, "Couldn't draft the messages. Try again in a moment."));
    } finally {
      setDrafting(false);
    }
  }

  async function confirm(actionId: string, edits: ConfirmEdits) {
    const result = await confirmAction(actionId, edits);
    const done = result.cards.find((item): item is OutreachCard => item.type === "outreach");
    if (done) setCard(done);
    refresh().catch(() => undefined);
    if (done) onDone(done);
  }

  async function cancel(actionId: string) {
    try {
      await cancelAction(actionId);
    } finally {
      onClose();
    }
  }

  if (card) {
    return (
      <div className="-mt-2">
        <OutreachReview card={card} onConfirm={confirm} onCancel={cancel} />
        {card.stage === "done" && (
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    );
  }

  const invitation = purpose === "interview_invitation";
  return (
    <form onSubmit={(event) => void draft(event)} className="flex flex-col gap-4">
      <p className="text-[13px] text-charcoal">
        For: {candidates.map((candidate) => `${candidate.name} (${candidate.role})`).join(", ")}
      </p>
      <Field label="What to write" htmlFor="outreach-purpose">
        <Select id="outreach-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value as OutreachRequest["purpose"])}>
          <option value="interview_invitation">Interview invitation</option>
          <option value="message">A message</option>
        </Select>
      </Field>
      <Field label="Anything it should say (optional)" htmlFor="outreach-instructions">
        <Textarea
          id="outreach-instructions"
          rows={2}
          maxLength={500}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder={invitation ? "Mention it's with Maya from the design team" : "Tell them we're reviewing portfolios this week"}
        />
      </Field>
      {invitation && (
        <fieldset className="flex flex-col gap-3 rounded-[10px] border border-border p-3.5">
          <legend className="px-1 text-xs text-stone">Interview times</legend>
          <label htmlFor="outreach-schedule" className="flex items-center gap-2 text-sm text-charcoal">
            <Checkbox id="outreach-schedule" checked={schedule} onCheckedChange={(value) => setSchedule(value === true)} />
            Propose a time for each, back to back
          </label>
          {schedule && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Interview" htmlFor="outreach-title">
                <Input id="outreach-title" value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} />
              </Field>
              <Field label="Length" htmlFor="outreach-minutes">
                <Select id="outreach-minutes" value={minutes} onChange={(event) => setMinutes(event.target.value)}>
                  {[30, 45, 60, 90].map((value) => (
                    <option key={value} value={value}>
                      {value} minutes
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Day" htmlFor="outreach-day">
                <Input id="outreach-day" type="date" required min={isoDay(new Date())} value={day} onChange={(event) => setDay(event.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="From" htmlFor="outreach-from">
                  <Input id="outreach-from" type="time" required value={from} onChange={(event) => setFrom(event.target.value)} />
                </Field>
                <Field label="To" htmlFor="outreach-to">
                  <Input id="outreach-to" type="time" required min={from} value={to} onChange={(event) => setTo(event.target.value)} />
                </Field>
              </div>
            </div>
          )}
          {!schedule && <p className="text-xs text-stone">The invitations will ask each candidate for times that suit them.</p>}
        </fieldset>
      )}
      {problem && (
        <p role="alert" className="rounded-[8px] border border-danger/20 bg-danger/[0.06] px-3 py-2.5 text-sm text-danger">
          {problem}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={drafting}>
          Cancel
        </Button>
        <Button type="submit" variant="ai" disabled={drafting || candidates.length === 0}>
          {drafting ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {drafting ? "Drafting…" : `Draft ${pluralize(candidates.length, "personalized message")}`}
        </Button>
      </div>
    </form>
  );
}
