"use client";

import { ArrowLeft, LoaderCircle, MessageSquareText, SendHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { MessageBubble } from "@/components/recruiter/MessageBubble";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Avatar } from "@/components/shared/Avatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { SearchBar } from "@/components/shared/SearchBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toaster";
import { firstName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { askCandidateAI } from "@/services/ai";
import { markConversationRead, sendMessage } from "@/services/messages";
import type { Conversation } from "@/types/workspace";

type MessagesInboxProps = {
  initialConversations: Conversation[];
  /** From ?candidate=: opens (or starts) that candidate's thread. */
  initialCandidateId?: string;
};

export function MessagesInbox({ initialConversations, initialCandidateId }: MessagesInboxProps) {
  const { candidates, markThreadRead } = useWorkspace();
  const firstId = initialCandidateId ?? initialConversations[0]?.candidate.id;
  const [conversations, setConversations] = useState(() =>
    initialConversations.map((conversation) => (conversation.candidate.id === firstId ? { ...conversation, unread: 0 } : conversation)),
  );
  const [activeId, setActiveId] = useState(firstId);
  const [threadOpen, setThreadOpen] = useState(Boolean(initialCandidateId));
  const [filter, setFilter] = useState("");

  // The thread shown on arrival counts as read; tell the server and the sidebar once.
  const initialUnread = useRef(initialConversations.find((conversation) => conversation.candidate.id === firstId)?.unread ?? 0);
  useEffect(() => {
    if (!firstId || initialUnread.current === 0) return;
    initialUnread.current = 0;
    markThreadRead();
    void markConversationRead(firstId);
  }, [firstId, markThreadRead]);

  // A candidate without a thread yet (e.g. "Message Daniel") gets an empty conversation to start.
  const threads = useMemo(() => {
    if (!activeId || conversations.some((conversation) => conversation.candidate.id === activeId)) return conversations;
    const candidate = candidates.find((item) => item.id === activeId);
    if (!candidate) return conversations;
    const { id, name, role, avatarUrl } = candidate;
    return [{ candidate: { id, name, role, avatarUrl }, messages: [], unread: 0 }, ...conversations];
  }, [activeId, candidates, conversations]);

  const shown = threads.filter((conversation) => conversation.candidate.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const active = threads.find((conversation) => conversation.candidate.id === activeId);

  function open(id: string) {
    setActiveId(id);
    setThreadOpen(true);
    const conversation = conversations.find((item) => item.candidate.id === id);
    if (conversation && conversation.unread > 0) {
      setConversations((current) => current.map((item) => (item.candidate.id === id ? { ...item, unread: 0 } : item)));
      markThreadRead();
      void markConversationRead(id);
    }
  }

  function appendMessage(conversation: Conversation, message: Conversation["messages"][number]) {
    setConversations((current) => {
      const existing = current.find((item) => item.candidate.id === conversation.candidate.id);
      const updated = { ...(existing ?? conversation), messages: [...(existing ?? conversation).messages, message] };
      return [updated, ...current.filter((item) => item.candidate.id !== conversation.candidate.id)];
    });
  }

  return (
    <div className="glass grid min-h-[560px] overflow-hidden rounded-[22px] border border-border lg:h-[calc(100dvh-15rem)] lg:grid-cols-[340px_minmax(0,1fr)]">
      <section aria-label="Conversations" className={cn("flex min-h-0 flex-col border-border lg:border-r", threadOpen && "hidden lg:flex")}>
        <div className="p-3">
          <SearchBar
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search conversations"
            className="h-10 rounded-[10px] text-sm"
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {shown.map((conversation) => {
            const last = conversation.messages.at(-1);
            const selected = conversation.candidate.id === activeId;
            return (
              <li key={conversation.candidate.id}>
                <button
                  type="button"
                  onClick={() => open(conversation.candidate.id)}
                  aria-current={selected || undefined}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-[12px] px-3 py-3 text-left transition-colors hover:bg-white/[0.04]",
                    selected && "bg-white/[0.07] hover:bg-white/[0.07]",
                  )}
                >
                  <Avatar name={conversation.candidate.name} src={conversation.candidate.avatarUrl} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-sm", conversation.unread ? "font-semibold text-ink" : "font-medium text-charcoal")}>
                        {conversation.candidate.name}
                      </span>
                      {last && <RelativeTime iso={last.sentAt} className="shrink-0 text-xs text-faint" />}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={cn("line-clamp-1 flex-1 text-[13px]", conversation.unread ? "text-charcoal" : "text-stone")}>
                        {last ? `${last.author === "recruiter" ? "You: " : ""}${last.body}` : "No messages yet"}
                      </span>
                      {conversation.unread > 0 && (
                        <span className="size-2 shrink-0 rounded-full bg-ai">
                          <span className="sr-only">Unread</span>
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-3 py-8 text-center text-sm text-stone">No conversations match.</li>}
        </ul>
      </section>

      <section aria-label="Conversation" className={cn("min-h-0 flex-col", threadOpen ? "flex" : "hidden lg:flex")}>
        {active ? (
          <Thread key={active.candidate.id} conversation={active} onBack={() => setThreadOpen(false)} onSent={appendMessage} />
        ) : (
          <EmptyState icon={MessageSquareText} title="No conversation selected" description="Choose a candidate to read and reply." className="m-6 flex-1 border-none" />
        )}
      </section>
    </div>
  );
}

type ThreadProps = {
  conversation: Conversation;
  onBack: () => void;
  onSent: (conversation: Conversation, message: Conversation["messages"][number]) => void;
};

function Thread({ conversation, onBack, onSent }: ThreadProps) {
  const { candidates } = useWorkspace();
  const toast = useToast();
  const composerId = useId();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draftController = useRef<AbortController | null>(null);
  const candidate = candidates.find((item) => item.id === conversation.candidate.id);
  const first = firstName(conversation.candidate.name);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [conversation.messages.length]);

  useEffect(() => () => draftController.current?.abort(), []);

  async function draftWithAI() {
    const controller = new AbortController();
    draftController.current = controller;
    setDrafting(true);
    let text = "";
    try {
      for await (const event of askCandidateAI({
        candidateId: conversation.candidate.id,
        message: "Draft a follow-up message",
        signal: controller.signal,
      })) {
        if (event.event !== "delta") continue;
        text += event.data.text;
        // Keep only the message itself: drop the AI's preamble and subject line.
        const start = text.indexOf(`Hi ${first}`);
        if (start !== -1) setDraft(text.slice(start).replace(/\*\*/g, ""));
      }
    } catch {
      if (!controller.signal.aborted) toast({ title: "Couldn't draft a message", description: "Try again in a moment.", tone: "error" });
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const message = await sendMessage(conversation.candidate.id, body);
      onSent(conversation, message);
      setDraft("");
    } catch {
      toast({ title: "Message not sent", description: "Check your connection and try again.", tone: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to conversations" className="lg:hidden">
          <ArrowLeft />
        </Button>
        <Avatar name={conversation.candidate.name} src={conversation.candidate.avatarUrl} size={40} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium text-ink">{conversation.candidate.name}</h2>
          <p className="truncate text-[13px] text-stone">{conversation.candidate.role}</p>
        </div>
        {candidate && <StatusBadge stage={candidate.stage} className="hidden sm:inline-flex" />}
        <Link href={`/recruiter/candidates?candidate=${conversation.candidate.id}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          View profile
        </Link>
      </header>

      <div ref={scrollRef} className="flex min-h-[240px] flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6">
        {conversation.messages.length === 0 ? (
          <p className="m-auto max-w-xs text-center text-sm text-stone">
            No messages with {first} yet. Write one below, or let AI draft an opener for you to review.
          </p>
        ) : (
          conversation.messages.map((message) => <MessageBubble key={message.id} message={message} authorName={conversation.candidate.name} />)
        )}
      </div>

      <form
        className="border-t border-border p-3 sm:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label htmlFor={composerId} className="sr-only">
          Message {first}
        </label>
        <Textarea
          id={composerId}
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={`Write to ${first}…`}
          aria-describedby={`${composerId}-hint`}
          readOnly={drafting}
          className="field-sizing-content max-h-56 min-h-[84px] bg-black/20"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="ai" size="sm" onClick={() => void draftWithAI()} disabled={drafting || sending}>
            {drafting ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            {drafting ? "Drafting…" : "Draft with AI"}
          </Button>
          <p id={`${composerId}-hint`} className="hidden flex-1 text-xs text-faint sm:block">
            AI only drafts. Nothing is sent until you press Send (Ctrl/⌘ + Enter).
          </p>
          <Button type="submit" size="sm" className="ml-auto" disabled={!draft.trim() || sending || drafting}>
            {sending ? <LoaderCircle className="animate-spin" /> : <SendHorizontal />}
            Send
          </Button>
        </div>
      </form>
    </>
  );
}
