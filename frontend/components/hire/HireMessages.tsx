"use client";

import { ArrowLeft, LoaderCircle, MessageCircle, SendHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { MessageBubble } from "@/components/recruiter/MessageBubble";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { firstName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import { markConversationRead, sendMessage } from "@/services/messages";
import type { Conversation } from "@/types/workspace";

/**
 * Simple Hire's messages: one conversation per applicant. What the owner sends reaches the applicant's
 * candidate portal (and their email when that's set up), and they can reply here: sending a message turns
 * replies on for that application, as messaging someone back implies.
 */
export function HireMessages({
  initialConversations,
  initialApplicant,
}: {
  initialConversations: Conversation[];
  initialApplicant: string | null;
}) {
  const { candidates, setMessaging, markThreadRead, syncUnreadThreads } = useWorkspace();
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const known = initialConversations.some((each) => each.candidate.id === initialApplicant);
    const applicant = candidates.find((each) => each.id === initialApplicant);
    // Messaging someone for the first time starts their conversation.
    if (initialApplicant && !known && applicant) {
      return [
        { candidate: { id: applicant.id, name: applicant.name, role: applicant.role }, messages: [], unread: 0 },
        ...initialConversations,
      ];
    }
    return initialConversations;
  });
  const [activeId, setActiveId] = useState<string | null>(initialApplicant ?? null);
  const active = conversations.find((each) => each.candidate.id === activeId) ?? null;

  async function open(id: string) {
    setActiveId(id);
    const conversation = conversations.find((each) => each.candidate.id === id);
    if (!conversation?.unread) return;
    setConversations((list) => list.map((each) => (each.candidate.id === id ? { ...each, unread: 0 } : each)));
    markThreadRead();
    await markConversationRead(id).catch(() => undefined);
    await syncUnreadThreads().catch(() => undefined);
  }

  async function send(id: string, body: string) {
    const message = await sendMessage(id, body);
    setConversations((list) =>
      list.map((each) => (each.candidate.id === id ? { ...each, messages: [...each.messages, message] } : each)),
    );
    const applicant = candidates.find((each) => each.id === id);
    if (applicant && !applicant.candidateMessagingEnabled) await setMessaging([id], true).catch(() => undefined);
  }

  return (
    <div>
      <h1
        className={cn("text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]", active && "hidden md:block")}
      >
        Messages
      </h1>
      <div className="mt-5 grid gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
        <ul aria-label="Conversations" className={cn("flex flex-col gap-2", active && "hidden md:flex")}>
          {conversations.length === 0 && (
            <li className="glass rounded-[16px] border border-border p-5 text-[15px] text-stone">
              No messages yet. Message an applicant from Applicants, or ask on Home: &ldquo;Message these three.&rdquo;
            </li>
          )}
          {conversations.map((conversation) => {
            const last = conversation.messages.at(-1);
            return (
              <li key={conversation.candidate.id}>
                <button
                  type="button"
                  onClick={() => void open(conversation.candidate.id)}
                  aria-current={conversation.candidate.id === activeId ? "true" : undefined}
                  className={cn(
                    "w-full rounded-[16px] border p-4 text-left transition-colors",
                    conversation.candidate.id === activeId
                      ? "border-brand-ink/40 bg-brand-soft/60"
                      : "border-border bg-surface hover:bg-overlay",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-base font-semibold text-ink">{conversation.candidate.name}</span>
                    {conversation.unread > 0 && (
                      <span className="rounded-full bg-highlight px-2 text-xs leading-5 font-semibold text-on-highlight">
                        {conversation.unread}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-faint">{conversation.candidate.role}</span>
                  {last && <span className="mt-1 line-clamp-2 block text-sm text-stone">{last.body}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {active ? (
          <Thread key={active.candidate.id} conversation={active} onBack={() => setActiveId(null)} onSend={send} />
        ) : (
          <div className="glass hidden items-center justify-center rounded-[18px] border border-border p-10 text-center text-[15px] text-stone md:flex">
            <span className="flex flex-col items-center gap-2">
              <MessageCircle aria-hidden className="size-6 text-brand-ink" />
              Choose a conversation.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

type ThreadProps = {
  conversation: Conversation;
  onBack: () => void;
  onSend: (id: string, body: string) => Promise<void>;
};

function Thread({ conversation, onBack, onSend }: ThreadProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const name = useMemo(() => firstName(conversation.candidate.name), [conversation.candidate.name]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [conversation.messages.length]);

  async function submit() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(conversation.candidate.id, text);
      setBody("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      aria-label={`Conversation with ${conversation.candidate.name}`}
      className="glass flex min-h-[420px] flex-col rounded-[18px] border border-border"
    >
      <header className="flex items-center gap-2 border-b border-border p-4">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to conversations" className="md:hidden">
          <ArrowLeft />
        </Button>
        <div>
          <p className="text-base font-semibold text-ink">{conversation.candidate.name}</p>
          <p className="text-xs text-faint">{conversation.candidate.role}</p>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {conversation.messages.length === 0 && (
          <p className="text-[15px] text-stone">No messages yet. Say hello to {name}.</p>
        )}
        {conversation.messages.map((message) => (
          <div key={message.id} className="flex flex-col gap-0.5">
            <MessageBubble message={message} authorName={conversation.candidate.name} />
            <span className={cn("text-[11px] text-faint", message.author === "recruiter" ? "self-end" : "self-start")}>
              <RelativeTime iso={message.sentAt} />
            </span>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="flex flex-col gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={2}
            placeholder={`Write to ${name}…`}
            aria-label={`Message to ${conversation.candidate.name}`}
            className="text-base"
          />
          <Button type="submit" size="lg" disabled={sending || !body.trim()} aria-label="Send">
            {sending ? <LoaderCircle aria-hidden className="animate-spin" /> : <SendHorizontal aria-hidden />}
          </Button>
        </div>
        <p className="text-xs text-faint">They&apos;ll see it in their candidate portal, and can reply here.</p>
      </form>
    </section>
  );
}
