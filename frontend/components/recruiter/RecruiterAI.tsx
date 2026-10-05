"use client";

import { BarChart3, BriefcaseBusiness, CalendarClock, History, Mic, ShieldCheck, Sparkles, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { AIComposer, suggestionChipStyles } from "@/components/ai/AIComposer";
import { AIMessageContent } from "@/components/ai/AIMessageContent";
import { AssistantCardView, type CardActions } from "@/components/recruiter/assistant/AssistantCards";
import { RecentActions } from "@/components/recruiter/assistant/RecentActions";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { useAssistant, type AssistantTurn } from "@/hooks/useAssistant";
import { firstName } from "@/lib/format";
import type { AssistantResponse } from "@/types/assistant";

const CAPABILITIES = [
  { icon: UsersRound, label: "Message candidates", example: "Send Sophia an interview invitation for next Tuesday" },
  { icon: BriefcaseBusiness, label: "Create and publish jobs", example: "Create a Backend Engineer job in London" },
  { icon: CalendarClock, label: "Look up interviews", example: "What interview does Sophia have next?" },
  { icon: BarChart3, label: "Portal analytics", example: "What were candidates looking for this week?" },
];

const STARTERS = ["Show my open jobs", "What were candidates looking for this week?", "Show candidates interviewing for Product Designer"];

/**
 * The recruiter AI Assistant: one conversation for every request, run by the action
 * engine (/assistant/requests). It answers, drafts and prepares; sending a message or publishing a job
 * always waits for the recruiter's confirmation. ?candidate= focuses it on one application.
 */
export function RecruiterAI({ initialCandidateId }: { initialCandidateId?: string }) {
  const { candidates } = useWorkspace();
  const assistant = useAssistant(initialCandidateId);

  const focused = useMemo(
    () => candidates.find((candidate) => candidate.id === assistant.context.application_id) ?? null,
    [candidates, assistant.context.application_id],
  );

  const actions: CardActions = {
    onConfirm: assistant.confirm,
    onCancel: assistant.cancel,
    onSend: (text, context) => void assistant.send(text, "text", context),
    busy: assistant.pending,
  };

  return (
    <div>
      <RecruiterHeader
        title="AI Assistant"
        subtitle="Ask anything. It drafts and prepares; nothing is sent or published until you confirm."
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section
          aria-label="Conversation with the AI Assistant"
          className="glass flex min-h-[520px] flex-col rounded-[16px] border border-border p-4 sm:p-5 xl:h-[calc(100dvh-13.5rem)]"
        >
          {focused && (
            <div className="mb-3 flex w-fit items-center gap-2 rounded-full bg-ink/[0.05] py-1 pr-1 pl-3 text-xs text-charcoal ring-1 ring-ink/10">
              Focused on {focused.name} · {focused.role}
              <button
                type="button"
                onClick={assistant.clearFocus}
                aria-label={`Stop focusing on ${focused.name}`}
                className="rounded-full p-0.5 text-stone transition-colors hover:bg-ink/10 hover:text-ink"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </div>
          )}
          {assistant.turns.length === 0 ? (
            <Welcome focusedName={focused ? firstName(focused.name) : null} onPick={(text) => void assistant.send(text)} disabled={assistant.pending} />
          ) : (
            <Thread turns={assistant.turns} actions={actions} />
          )}
          <AIComposer
            className="mt-4 border-t border-border pt-4"
            id="assistant-prompt"
            label="Ask the AI Assistant"
            placeholder="Ask the AI Assistant anything…"
            suggestions={[]}
            pending={assistant.pending}
            onSend={(text) => void assistant.send(text, "text")}
          />
        </section>

        <aside aria-label="Assistant details" className="flex flex-col gap-4 xl:sticky xl:top-6">
          <div className="glass rounded-[14px] border border-border p-5">
            <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
              <History aria-hidden className="size-4 text-stone" /> Recent actions
            </h2>
            <div className="mt-3">
              <RecentActions items={assistant.history} />
            </div>
          </div>
          <div className="glass rounded-[14px] border border-border p-5 text-sm">
            <h2 className="flex items-center gap-2 font-medium text-ink">
              <ShieldCheck aria-hidden className="size-4 text-ai" /> How it works
            </h2>
            <p className="mt-3 text-xs leading-relaxed text-stone">
              Every request goes through the same steps. Messages and job postings are prepared for you to review, and
              only go out when you confirm. It never ranks or rejects candidates, and never sees anyone&apos;s demographic answers;
              those exist only as aggregates on the Analytics page.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Welcome({ focusedName, onPick, disabled }: { focusedName: string | null; onPick: (text: string) => void; disabled: boolean }) {
  const starters = focusedName
    ? [`Tell me about ${focusedName}'s application`, `What interview does ${focusedName} have next?`, `Draft an interview email for ${focusedName}`]
    : STARTERS;
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-ai/10 ring-1 ring-ai/20">
        <Sparkles aria-hidden className="size-5 text-ai" />
      </span>
      <h2 className="mt-3.5 text-lg font-semibold tracking-tight text-ink">What can I do for you?</h2>
      <p className="mt-1.5 max-w-md text-sm text-stone">Type a request, or start from one of these.</p>
      <ul className="mt-5 grid w-full max-w-xl gap-2 text-left sm:grid-cols-2">
        {CAPABILITIES.map(({ icon: Icon, label, example }) => (
          <li key={label}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(example)}
              className="flex h-full w-full gap-2.5 rounded-[10px] border border-border bg-ink/[0.03] px-3.5 py-2.5 text-left transition-[background-color,border-color] duration-200 hover:border-ink/30 hover:bg-ink/[0.06] disabled:opacity-50"
            >
              <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ai" />
              <span>
                <span className="block text-sm text-ink">{label}</span>
                <span className="mt-0.5 block text-xs text-stone">&ldquo;{example}&rdquo;</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div role="group" aria-label="Suggested requests" className="mt-4 flex flex-wrap justify-center gap-2">
        {starters.map((starter) => (
          <button key={starter} type="button" disabled={disabled} onClick={() => onPick(starter)} className={suggestionChipStyles}>
            {starter}
          </button>
        ))}
      </div>
    </div>
  );
}

function Thread({ turns, actions }: { turns: AssistantTurn[]; actions: CardActions }) {
  const container = useRef<HTMLDivElement>(null);
  const last = turns.at(-1);

  useEffect(() => {
    const element = container.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [turns.length, last]);

  return (
    <div
      ref={container}
      role="log"
      aria-label="Conversation"
      aria-live="polite"
      aria-busy={last?.role === "assistant" && last.status === "thinking"}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pr-1 pb-2"
    >
      {turns.map((turn) =>
        turn.role === "user" ? (
          <p key={turn.id} className="flex max-w-[85%] animate-rise items-start gap-1.5 self-end rounded-[12px] rounded-br-[4px] bg-ink/[0.1] px-3.5 py-2 text-sm text-ink">
            {turn.inputType === "voice" && <Mic aria-label="Spoken" className="mt-0.5 size-3.5 shrink-0 text-stone" />}
            <span>{turn.text}</span>
          </p>
        ) : (
          <AssistantTurnView key={turn.id} turn={turn} actions={actions} />
        ),
      )}
    </div>
  );
}

function AssistantTurnView({ turn, actions }: { turn: Exclude<AssistantTurn, { role: "user" }>; actions: CardActions }) {
  return (
    <div className="flex animate-rise gap-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] ring-1 ring-ink/10">
        <Sparkles aria-hidden className="size-3.5 text-ink" />
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-charcoal">
        {turn.status === "thinking" ? (
          <span className="inline-flex h-6 items-center gap-1">
            <span className="sr-only">Working…</span>
            {[0, 150, 300].map((delay) => (
              <span key={delay} aria-hidden className="size-1.5 animate-pulse rounded-full bg-ink/70" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </span>
        ) : turn.status === "error" ? (
          <p className="text-danger">{turn.error}</p>
        ) : (
          <Answer response={turn.response} actions={actions} />
        )}
      </div>
    </div>
  );
}

function Answer({ response, actions }: { response: AssistantResponse; actions: CardActions }) {
  return (
    <>
      <AIMessageContent text={response.reply} />
      {response.cards.map((card, index) => (
        <AssistantCardView key={`${card.type}-${"action_id" in card ? card.action_id : index}`} card={card} actions={actions} />
      ))}
      {response.sources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-faint">
          {response.sources.map((source) => (
            <span key={`${source.type}-${source.id}`} className="rounded-full bg-ink/[0.05] px-2 py-0.5 ring-1 ring-ink/10">
              {source.label}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
