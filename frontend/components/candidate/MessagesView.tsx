"use client";

import { LoaderCircle, Mail, MessageSquareText, SendHorizontal } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { CandidateHeader } from "@/components/candidate/CandidateHeader";
import { LoadError } from "@/components/candidate/LoadError";
import { MessageItem } from "@/components/candidate/MessageItem";
import { Avatar } from "@/components/shared/Avatar";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toaster";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { firstName, formatDayLabel } from "@/lib/format";
import { errorMessage } from "@/services/api";
import { getMessageThread, markMessagesRead, sendCandidateMessage } from "@/services/portal";
import { cn } from "@/lib/utils";
import type { CandidateMessage, CandidateMessageThread, MessageKind } from "@/types/portal";

const MESSAGE_REFRESH_MS = 8_000;

const isIncomingUnread = (message: CandidateMessage) => message.sender !== "candidate" && !message.readAt;

// What the candidate can say their message is. The hiring team sees the label; the text is never
// analysed to guess it.
const KINDS: { value: MessageKind; label: string }[] = [
  { value: "message", label: "Message" },
  { value: "question", label: "Question" },
  { value: "thank_you", label: "Thank-you note" },
  { value: "follow_up", label: "Follow-up" },
];

/** The thread for the application the portal is showing; the server-rendered thread is only used
 * when it was rendered for that same application. */
export function CandidateMessages({ renderedFor, initialThread }: { renderedFor: string | null; initialThread?: CandidateMessageThread }) {
  const { applicationId } = useCandidatePortal();
  return (
    <MessagesView key={applicationId ?? "none"} applicationId={applicationId} initialThread={renderedFor === applicationId ? initialThread : undefined} />
  );
}

function MessagesView({ applicationId, initialThread }: { applicationId: string | null; initialThread?: CandidateMessageThread }) {
  const { me, update, refresh: refreshPortal } = useCandidatePortal();
  const load = useCallback(() => getMessageThread(applicationId), [applicationId]);
  const { data: thread, error, refresh, setData } = useLiveQuery(load, {
    initialData: initialThread,
    intervalMs: MESSAGE_REFRESH_MS,
  });
  // Where "New" goes: the first message that was unread when the page opened.
  const [firstUnreadId] = useState(() => initialThread?.messages.find(isIncomingUnread)?.id);
  const unread = thread?.unread ?? 0;

  // Reading the thread marks it read, for the badge here and for the read state the recruiter sees.
  useEffect(() => {
    if (unread === 0 || document.visibilityState !== "visible") return;
    let cancelled = false;
    markMessagesRead(applicationId).then(
      () => {
        if (cancelled) return;
        const readAt = new Date().toISOString();
        setData((current) => current && { ...current, unread: 0, messages: current.messages.map((m) => (isIncomingUnread(m) ? { ...m, readAt } : m)) });
        update((current) => ({ ...current, unreadMessages: 0 }));
      },
      () => undefined, // stays unread; the next refresh retries
    );
    return () => {
      cancelled = true;
    };
  }, [unread, applicationId, setData, update]);

  if (!thread) {
    return (
      <>
        <CandidateHeader title="Messages" />
        {error ? (
          <LoadError title="Your messages couldn't load" message={error} onRetry={() => void refresh()} />
        ) : (
          <Skeleton className="h-[560px] rounded-[22px]" />
        )}
      </>
    );
  }

  const recruiter = thread.recruiter;
  const recruiterFirst = recruiter ? firstName(recruiter.name) : "the hiring team";

  return (
    <>
      <CandidateHeader title="Messages" subtitle={`Your conversation with ${recruiter ? recruiter.name : `the ${me.company} hiring team`}`} />
      <section
        aria-label="Conversation"
        className="glass flex min-h-[520px] flex-col overflow-hidden rounded-[22px] border border-border lg:h-[calc(100dvh-16rem)]"
      >
        <header className="flex items-center gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <Avatar name={recruiter?.name ?? me.company} size={40} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-medium text-ink">{recruiter?.name ?? `${me.company} hiring team`}</h2>
            <p className="truncate text-[13px] text-stone">
              {recruiter ? `${recruiter.title} · ${me.company}` : "Recruiting"}
              {me.job && ` · ${me.job.title}`}
            </p>
          </div>
          {recruiter && (
            <a href={`mailto:${recruiter.email}`} className="hidden items-center gap-1.5 text-[13px] text-stone hover:text-ink sm:inline-flex">
              <Mail aria-hidden className="size-4" /> {recruiter.email}
            </a>
          )}
        </header>
        <MessageList messages={thread.messages} firstUnreadId={firstUnreadId} recruiterFirst={recruiterFirst} />
        <Composer
          applicationId={applicationId}
          recruiterFirst={recruiterFirst}
          onSent={(message) => {
            setData((current) => current && { ...current, messages: [...current.messages, message] });
            void refreshPortal(); // the dashboard's activity and the recruiter-facing timeline
          }}
        />
      </section>
    </>
  );
}

function MessageList({ messages, firstUnreadId, recruiterFirst }: { messages: CandidateMessage[]; firstUnreadId?: string; recruiterFirst: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-white/[0.05] ring-1 ring-white/10">
          <MessageSquareText aria-hidden className="size-5 text-stone" />
        </span>
        <p className="font-medium text-ink">No messages yet.</p>
        <p className="max-w-xs text-sm text-stone">Questions about your application or interviews? Write to {recruiterFirst} below.</p>
      </div>
    );
  }

  const lastOwnId = messages.findLast((message) => message.sender === "candidate")?.id;

  return (
    <div ref={scrollRef} role="log" aria-label="Messages" className="flex min-h-[240px] flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6">
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const day = formatDayLabel(message.sentAt, { long: true });
        const newDay = !previous || formatDayLabel(previous.sentAt, { long: true }) !== day;
        const grouped = !newDay && previous?.sender === message.sender && message.id !== firstUnreadId;
        return (
          <div key={message.id}>
            {newDay && (
              <p className="my-4 text-center text-xs font-medium text-faint" suppressHydrationWarning>
                {day}
              </p>
            )}
            {message.id === firstUnreadId && (
              <p className="my-3 flex items-center gap-3 text-xs font-medium text-violet-200">
                <span aria-hidden className="h-px flex-1 bg-ai/30" /> New <span aria-hidden className="h-px flex-1 bg-ai/30" />
              </p>
            )}
            <MessageItem message={message} grouped={grouped} receipt={message.id === lastOwnId} />
          </div>
        );
      })}
    </div>
  );
}

type ComposerProps = { applicationId: string | null; recruiterFirst: string; onSent: (message: CandidateMessage) => void };

function Composer({ applicationId, recruiterFirst, onSent }: ComposerProps) {
  const toast = useToast();
  const composerId = useId();
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<MessageKind>("message");
  const [sending, setSending] = useState(false);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      onSent(await sendCandidateMessage(body, { kind, applicationId }));
      setDraft("");
      setKind("message");
    } catch (error) {
      toast({ title: "Message not sent", description: errorMessage(error, "Check your connection and try again."), tone: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      className="border-t border-border p-3 sm:p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <div role="radiogroup" aria-label="What kind of message is this?" className="mb-2.5 flex flex-wrap gap-1.5">
        {KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={kind === option.value}
            onClick={() => setKind(option.value)}
            className={cn(
              "h-7 rounded-full px-3 text-xs font-medium ring-1 transition-colors",
              kind === option.value ? "bg-white/[0.1] text-ink ring-white/20" : "text-stone ring-white/[0.08] hover:text-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label htmlFor={composerId} className="sr-only">
        Message {recruiterFirst}
      </label>
      <Textarea
        id={composerId}
        rows={2}
        value={draft}
        maxLength={5000}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void send();
          }
        }}
        placeholder={`Write to ${recruiterFirst}…`}
        aria-describedby={`${composerId}-hint`}
        className="field-sizing-content max-h-48 min-h-[64px] bg-black/20"
      />
      <div className="mt-3 flex items-center gap-3">
        <p id={`${composerId}-hint`} className="hidden flex-1 text-xs text-faint sm:block">
          Enter to send, Shift + Enter for a new line.
        </p>
        <Button type="submit" size="sm" className="ml-auto" disabled={!draft.trim() || sending}>
          {sending ? <LoaderCircle className="animate-spin" /> : <SendHorizontal />}
          Send
        </Button>
      </div>
    </form>
  );
}
