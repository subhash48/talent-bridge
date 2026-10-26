"use client";

import { BriefcaseBusiness, History, Inbox, ListChecks, Mic, MicOff, PenLine, ShieldCheck, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AIComposer, suggestionChipStyles } from "@/components/ai/AIComposer";
import { AIMessageContent } from "@/components/ai/AIMessageContent";
import { AssistantCardView, type CardActions } from "@/components/recruiter/assistant/AssistantCards";
import { RecentActions } from "@/components/recruiter/assistant/RecentActions";
import { VoicePanel } from "@/components/recruiter/assistant/VoicePanel";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { useAssistant, type AssistantTurn } from "@/hooks/useAssistant";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { firstName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import { getAssistantStatus } from "@/services/assistant";
import type { AssistantResponse, AssistantStatus, ConfirmEdits } from "@/types/assistant";

const CAPABILITIES = [
  { icon: Inbox, label: "Who needs an update", example: "Who needs an update today?" },
  { icon: PenLine, label: "Draft an update", example: "Draft Sophia an update" },
  { icon: ListChecks, label: "Find matching candidates", example: "Show 5 candidates for Product Designer matching Figma and design systems" },
  {
    icon: BriefcaseBusiness,
    label: "Draft a job",
    example: "Create a Senior Product Designer role in New York, hybrid, requiring Figma, design systems and user research",
  },
];

const STARTERS = [
  "Which candidates have unanswered questions?",
  "Show candidates who interviewed but haven't received an update",
  "Which interviews need confirmation?",
];

/**
 * The recruiter AI Assistant: one conversation for typed and spoken requests, run by the same action
 * engine (/assistant/requests): who needs an update, what candidates are waiting for, and drafts to
 * send. Sending always waits for the recruiter's confirmation. ?candidate= focuses it on one
 * application. Voice is a
 * secondary way in: the microphone beside Send.
 */
export function RecruiterAI({ initialCandidateId }: { initialCandidateId?: string }) {
  const { candidates, refresh } = useWorkspace();
  const router = useRouter();
  const assistant = useAssistant(initialCandidateId);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceAnswer, setVoiceAnswer] = useState<{ session: number; id: string } | null>(null);

  useEffect(() => {
    getAssistantStatus().then(setStatus, () => setStatus(null));
  }, []);

  const voice = useVoiceInput({
    serverTranscription: status?.voice_transcription ?? false,
    onTranscript: async (text, session) => {
      const response = await assistant.send(text, "voice");
      if (!response) {
        voice.fail(session, "The assistant couldn't answer just now. Try again, or type your request.");
        return;
      }
      setVoiceAnswer({ session, id: response.id });
      voice.responded(session, response.status === "completed");
    },
  });
  const { press } = voice;

  const openVoice = useCallback(() => {
    setVoiceOpen(true);
    press();
  }, [press]);

  const focused = useMemo(
    () => candidates.find((candidate) => candidate.id === assistant.context.application_id) ?? null,
    [candidates, assistant.context.application_id],
  );

  const { confirm: confirmProposal } = assistant;
  /** Approve, then show what changed elsewhere: a new job on the Jobs page, messages and interviews on candidates. */
  const approve = useCallback(
    async (actionId: string, edits?: ConfirmEdits) => {
      const result = await confirmProposal(actionId, edits);
      const card = result.cards[0];
      if (card?.type === "job_draft" && card.stage === "created") router.refresh();
      if (card?.type === "outreach" || card?.type === "message") refresh().catch(() => undefined);
      return result;
    },
    [confirmProposal, refresh, router],
  );

  const actions: CardActions = {
    onConfirm: approve,
    onCancel: assistant.cancel,
    onSend: (text, context) => void assistant.send(text, "text", context),
    onSelect: assistant.setSelection,
    onEdits: assistant.reportEdits,
    busy: assistant.pending,
  };

  // In the voice panel, confirming moves the voice state through Executing… to Complete.
  const voiceActions: CardActions = {
    ...actions,
    onConfirm: async (actionId, edits) => {
      const session = voice.state.session;
      voice.executing(session);
      try {
        const result = await approve(actionId, edits);
        if (result.status === "completed") voice.executed(session);
        else voice.fail(session, result.reply);
        return result;
      } catch (error) {
        voice.fail(session, errorMessage(error));
        throw error;
      }
    },
  };

  const voiceResponse = useMemo(() => {
    if (!voiceAnswer || voiceAnswer.session !== voice.state.session) return null;
    for (const turn of assistant.turns) {
      if (turn.role === "assistant" && turn.status === "done" && turn.response.id === voiceAnswer.id) return turn.response;
    }
    return null;
  }, [voiceAnswer, voice.state.session, assistant.turns]);

  const listening = voice.state.phase === "listening";
  const micUnavailable = voice.engine === "unsupported";
  const mic = (
    <button
      type="button"
      onClick={() => (voiceOpen ? press() : openVoice())}
      aria-pressed={listening}
      aria-label={listening ? "Stop listening" : "Speak to the AI Assistant"}
      title={micUnavailable ? "Voice input isn't supported in this browser" : undefined}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-ink/20 bg-ink/[0.04] text-ink transition-[border-color,background-color,transform] duration-200 hover:border-ink/35 hover:bg-ink/[0.07] active:scale-95",
        listening && "border-brand-ink/55 bg-brand-soft text-brand-ink",
      )}
    >
      {micUnavailable ? <MicOff aria-hidden className="size-4 text-stone" /> : <Mic aria-hidden className={cn("size-4", listening && "animate-pulse")} />}
    </button>
  );

  return (
    <div>
      <RecruiterHeader
        title="AI Assistant"
        subtitle="Ask who needs an update, find candidates on job-related criteria, draft outreach or a new job. Nothing is sent, scheduled or created until you approve."
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section
          aria-label="Conversation with the AI Assistant"
          className="glass flex min-h-[520px] flex-col rounded-[16px] border border-border p-4 sm:p-5 xl:h-[calc(100dvh-13.5rem)]"
        >
          {(assistant.context.selected_application_ids?.length ?? 0) > 0 && (
            <div className="mb-3 flex w-fit items-center gap-2 rounded-full bg-brand-soft py-1 pr-1 pl-3 text-xs text-ink ring-1 ring-brand-ink/25">
              {assistant.context.selected_application_ids?.length} selected: what you ask next applies to them only
              <button
                type="button"
                onClick={() => assistant.setSelection([])}
                aria-label="Clear the selection"
                className="rounded-full p-0.5 text-stone transition-colors hover:bg-ink/10 hover:text-ink"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </div>
          )}
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
            extraActions={mic}
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
              Typed and spoken requests go through the same steps. Messages, interview times and jobs are drafted for you to
              review, and only happen when you approve them, after one final look. It never evaluates, ranks or rejects
              candidates: lists show the filters behind them and why each candidate matches your job-related criteria, and
              only the candidates you tick are contacted.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-faint">
              Voice: only the words are kept, never the recording.
              {status && !status.voice_transcription && " Your browser transcribes speech on this server."}
            </p>
          </div>
        </aside>
      </div>

      {voiceOpen && (
        <VoicePanel
          state={voice.state}
          levels={voice.levels}
          response={voiceResponse}
          actions={voiceActions}
          onMic={press}
          onClose={() => {
            voice.cancel();
            setVoiceOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Welcome({ focusedName, onPick, disabled }: { focusedName: string | null; onPick: (text: string) => void; disabled: boolean }) {
  const starters = focusedName
    ? [`Draft ${focusedName} an update`, `Tell me about ${focusedName}'s application`, `What interview does ${focusedName} have next?`]
    : STARTERS;
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-ai/10 ring-1 ring-ai/20">
        <Sparkles aria-hidden className="size-5 text-ai" />
      </span>
      <h2 className="mt-3.5 text-lg font-semibold tracking-tight text-ink">What can I do for you?</h2>
      <p className="mt-1.5 max-w-md text-sm text-stone">Type a request, or tap the microphone and say it.</p>
      <ul className="mt-5 grid w-full max-w-xl gap-2 text-left sm:grid-cols-2">
        {CAPABILITIES.map(({ icon: Icon, label, example }) => (
          <li key={label}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(example)}
              className="flex h-full w-full gap-2.5 rounded-[10px] border border-border bg-surface-raised px-3.5 py-2.5 text-left transition-[background-color,border-color] duration-200 hover:border-brand-ink/35 hover:bg-brand-soft disabled:opacity-50"
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
  // A proposal changed further down (the job draft edited, interview times added) shows only its latest card.
  const latest = useMemo(() => {
    const where = new Map<string, string>();
    for (const turn of turns) {
      if (turn.role !== "assistant" || turn.status !== "done") continue;
      for (const card of turn.response.cards) if ("action_id" in card) where.set(card.action_id, turn.id);
    }
    return where;
  }, [turns]);

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
          <p key={turn.id} className="flex max-w-[85%] animate-rise items-start gap-1.5 self-end rounded-[12px] rounded-br-[4px] bg-brand-soft px-3.5 py-2 text-sm text-ink ring-1 ring-brand-ink/15">
            {turn.inputType === "voice" && <Mic aria-label="Spoken" className="mt-0.5 size-3.5 shrink-0 text-stone" />}
            <span>{turn.text}</span>
          </p>
        ) : (
          <AssistantTurnView key={turn.id} turn={turn} actions={actions} latest={latest} />
        ),
      )}
    </div>
  );
}

type TurnProps = { turn: Exclude<AssistantTurn, { role: "user" }>; actions: CardActions; latest: Map<string, string> };

function AssistantTurnView({ turn, actions, latest }: TurnProps) {
  return (
    <div className="flex animate-rise gap-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft ring-1 ring-brand-ink/20">
        <Sparkles aria-hidden className="size-3.5 text-brand-ink" />
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-charcoal">
        {turn.status === "thinking" ? (
          <span className="inline-flex h-6 items-center gap-1">
            <span className="sr-only">Working…</span>
            {[0, 150, 300].map((delay) => (
              <span key={delay} aria-hidden className="size-1.5 animate-pulse rounded-full bg-brand-ink/60" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </span>
        ) : turn.status === "error" ? (
          <p className="text-danger">{turn.error}</p>
        ) : (
          <Answer response={turn.response} actions={actions} superseded={(id) => latest.get(id) !== turn.id} />
        )}
      </div>
    </div>
  );
}

function Answer({ response, actions, superseded }: { response: AssistantResponse; actions: CardActions; superseded: (actionId: string) => boolean }) {
  return (
    <>
      <AIMessageContent text={response.reply} />
      {response.cards.map((card, index) => (
        <AssistantCardView
          key={`${card.type}-${"action_id" in card ? card.action_id : index}`}
          card={card}
          actions={actions}
          superseded={"action_id" in card && superseded(card.action_id)}
        />
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
