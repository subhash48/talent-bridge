"use client";

import { LoaderCircle, RefreshCw, SendHorizontal, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import { DeliveryNote } from "@/components/recruiter/communication/DeliveryNote";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import { discardDraft, draftUpdate, sendDraft } from "@/services/communication";
import type { DraftReason, UpdateDraft } from "@/types/communication";
import type { ThreadMessage } from "@/types/workspace";

type DraftPanelProps = {
  applicationId: string;
  firstName: string;
  /** What to write about; the server picks the rule needing attention when omitted. */
  reason?: DraftReason;
  /** An open draft written earlier, to review instead of writing a new one. */
  initialDraft?: UpdateDraft;
  emailConfigured: boolean;
  onSent?: (result: { draft: UpdateDraft; message: ThreadMessage }) => void;
  onClose?: () => void;
  className?: string;
};

type Phase = "drafting" | "ready" | "sending" | "sent" | "failed";

/**
 * Draft → edit → approve → send. The AI writes a draft for the reason the candidate needs an update;
 * the recruiter edits it and approves it, and only that sends anything: once, to the candidate portal,
 * and by email when it's configured.
 */
export function DraftPanel({
  applicationId,
  firstName,
  reason,
  initialDraft,
  emailConfigured,
  onSent,
  onClose,
  className,
}: DraftPanelProps) {
  const id = useId();
  const toast = useToast();
  const [draft, setDraft] = useState<UpdateDraft | undefined>(initialDraft);
  const [subject, setSubject] = useState(initialDraft?.subject ?? "");
  const [body, setBody] = useState(initialDraft?.body ?? "");
  const [phase, setPhase] = useState<Phase>(initialDraft ? "ready" : "drafting");
  const [sent, setSent] = useState<ThreadMessage>();
  const [error, setError] = useState<string>();
  const controller = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function write() {
    setPhase("drafting");
    setError(undefined);
    await fetchDraft();
  }

  /** Ask the AI for a draft. State changes only once it answers. */
  async function fetchDraft() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const written = await draftUpdate(applicationId, reason ?? initialDraft?.reason, undefined, current.signal);
      setDraft(written);
      setSubject(written.subject);
      setBody(written.body);
      setPhase("ready");
      requestAnimationFrame(() => bodyRef.current?.focus());
    } catch (caught) {
      if (current.signal.aborted) return;
      setError(errorMessage(caught, "Couldn't write a draft. Try again in a moment."));
      setPhase("failed");
    }
  }

  // Opening without a draft writes one straight away (the panel starts out "drafting").
  const start = useEffectEvent(() => void fetchDraft());
  useEffect(() => {
    if (!initialDraft) start();
  }, [initialDraft]);

  async function approve() {
    if (!draft || !subject.trim() || !body.trim()) return;
    setPhase("sending");
    try {
      const result = await sendDraft(draft.id, subject.trim(), body.trim());
      setSent(result.message);
      setPhase("sent");
      onSent?.(result);
    } catch (caught) {
      setPhase("ready");
      toast({ title: "Not sent", description: errorMessage(caught, "Check your connection and try again."), tone: "error" });
    }
  }

  async function discard() {
    if (draft) await discardDraft(draft.id).catch(() => undefined);
    onClose?.();
  }

  if (phase === "sent") {
    return (
      <div className={cn("rounded-[12px] border border-sage/20 bg-sage/[0.05] p-3.5", className)}>
        <p className="text-sm font-medium text-ink">Sent to {firstName}.</p>
        <DeliveryNote delivery={sent?.delivery} className="mt-1" />
      </div>
    );
  }

  const busy = phase === "drafting" || phase === "sending";
  return (
    <section
      aria-label={`Update for ${firstName}`}
      aria-busy={busy}
      className={cn("rounded-[12px] border border-border bg-ink/[0.03] p-3.5", className)}
    >
      {phase === "drafting" && (
        <p className="flex items-center gap-2 py-6 text-sm text-stone" role="status">
          <LoaderCircle aria-hidden className="size-4 animate-spin" /> Writing an update for {firstName}…
        </p>
      )}

      {phase === "failed" && (
        <div className="flex flex-col items-start gap-3 py-2">
          <p className="text-sm text-danger">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => void write()}>
            <RefreshCw /> Try again
          </Button>
        </div>
      )}

      {(phase === "ready" || phase === "sending") && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void approve();
          }}
        >
          <p className="flex items-center gap-1.5 text-xs text-stone">
            <Sparkles aria-hidden className="size-3.5" />
            AI draft from {firstName}&apos;s record. Edit anything; nothing is sent until you approve it.
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-subject`} className="text-xs font-medium text-charcoal">
              Subject
            </label>
            <Input
              id={`${id}-subject`}
              value={subject}
              maxLength={200}
              onChange={(event) => setSubject(event.target.value)}
              disabled={phase === "sending"}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-body`} className="text-xs font-medium text-charcoal">
              Message
            </label>
            <Textarea
              id={`${id}-body`}
              ref={bodyRef}
              value={body}
              rows={10}
              maxLength={5000}
              className="field-sizing-content max-h-[28rem] min-h-40"
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void approve();
                }
              }}
              disabled={phase === "sending"}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={phase === "sending" || !subject.trim() || !body.trim()}>
              {phase === "sending" ? <LoaderCircle className="animate-spin" /> : <SendHorizontal />}
              {phase === "sending" ? "Sending…" : "Approve and send"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void write()} disabled={phase === "sending"}>
              <RefreshCw /> Rewrite
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void discard()} disabled={phase === "sending"}>
              <Trash2 /> Discard
            </Button>
            <span className="ml-auto text-xs text-faint">
              {emailConfigured ? "Goes to their portal and by email" : "Goes to their portal (email isn't set up)"}
            </span>
          </div>
        </form>
      )}
    </section>
  );
}
