"use client";

import { LoaderCircle, Send } from "lucide-react";
import { useState } from "react";

import { SimpleApplicantsCard } from "@/components/hire/SimpleApplicantsCard";
import { SimpleJobCard } from "@/components/hire/SimpleJobCard";
import { SimpleOutreachCard } from "@/components/hire/SimpleOutreachCard";
import { AssistantCardView, type CardActions } from "@/components/recruiter/assistant/AssistantCards";
import { ContactsCard } from "@/components/recruiter/assistant/ContactsCard";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import type { AssistantCard, MessageCard } from "@/types/assistant";

/**
 * One of the assistant's answers, the Simple Hire way: big, plain, and with the one or two buttons that
 * matter. Anything Simple Hire has no simpler form of is shown as the full workspace shows it.
 */
export function SimpleCardView({
  card,
  actions,
  superseded,
}: {
  card: AssistantCard;
  actions: CardActions;
  superseded: boolean;
}) {
  switch (card.type) {
    case "job_draft":
      if (card.layout !== "simple") break;
      return (
        <SimpleJobCard
          card={card}
          busy={actions.busy}
          superseded={superseded}
          onEdits={(draft) => actions.onEdits(card.action_id, { job: draft })}
          onPost={(draft) => actions.onConfirm(card.action_id, { job: draft })}
        />
      );
    case "candidate_match":
      return (
        <SimpleApplicantsCard
          card={card}
          busy={actions.busy}
          onSelect={actions.onSelect}
          onAsk={(text) => actions.onSend(text)}
        />
      );
    case "contacts":
      return <ContactsCard card={card} large />;
    case "outreach":
      return (
        <SimpleOutreachCard
          card={card}
          busy={actions.busy}
          superseded={superseded}
          onEdits={(edits) => actions.onEdits(card.action_id, edits)}
          onSend={(edits) => actions.onConfirm(card.action_id, edits)}
        />
      );
    case "message":
      return <SimpleMessageCard card={card} actions={actions} superseded={superseded} />;
    case "clarify":
      return (
        <div className="mt-3 flex flex-col gap-2">
          {card.options.map((option) => (
            <button
              key={`${option.label}-${option.application_id ?? option.detail}`}
              type="button"
              disabled={actions.busy}
              onClick={() => actions.onSend(option.reply, { application_id: option.application_id })}
              className="rounded-[14px] border border-border bg-surface-raised px-4 py-3 text-left hover:border-brand-ink/40 hover:bg-brand-soft"
            >
              <span className="block text-base font-semibold text-ink">{option.label}</span>
              <span className="block text-sm text-stone">{option.detail}</span>
            </button>
          ))}
        </div>
      );
  }
  return <AssistantCardView card={card} actions={actions} superseded={superseded} />;
}

/** One message to one applicant: read it, change it if you like, then send it. */
function SimpleMessageCard({
  card,
  actions,
  superseded,
}: {
  card: MessageCard;
  actions: CardActions;
  superseded: boolean;
}) {
  const [body, setBody] = useState(card.body);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = card.status === "completed";
  const closed = superseded || card.status === "cancelled" || card.status === "failed";

  async function send() {
    setSending(true);
    setError(null);
    try {
      await actions.onConfirm(card.action_id, { body, enable_replies: true });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-3 rounded-[16px] border border-border bg-surface-raised p-4">
      <p className={cn("text-[15px] font-semibold", card.status === "failed" ? "text-danger" : "text-ink")}>
        {sent ? "Sent to" : card.status === "failed" ? "Not sent to" : "To"} {card.candidate.name}
      </p>
      {sent || closed ? (
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-charcoal">{card.body}</p>
      ) : (
        <Textarea
          className="mt-2"
          rows={5}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            actions.onEdits(card.action_id, { body: event.target.value, enable_replies: true });
          }}
          aria-label={`Message to ${card.candidate.name}`}
        />
      )}
      {(error ?? (card.status === "failed" ? card.error : null)) && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error ?? card.error}
        </p>
      )}
      {!sent && !closed && (
        <div className="mt-3 flex justify-end">
          <Button size="lg" onClick={() => void send()} disabled={actions.busy || sending || !body.trim()}>
            {sending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Send aria-hidden />}
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      )}
    </div>
  );
}
