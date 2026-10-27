"use client";

import {
  ArrowLeft,
  CalendarPlus,
  Megaphone,
  MessageCircle,
  Mic,
  MicOff,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AIComposer } from "@/components/ai/AIComposer";
import { AIMessageContent } from "@/components/ai/AIMessageContent";
import { SimpleCardView } from "@/components/hire/SimpleCards";
import type { CardActions } from "@/components/recruiter/assistant/AssistantCards";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { KavuntraMark } from "@/components/shared/KavuntraLogo";
import { Button } from "@/components/ui/Button";
import { handledCards, useAssistant, type AssistantTurn } from "@/hooks/useAssistant";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { firstName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VOICE_LABELS } from "@/lib/voice";
import { getAssistantStatus } from "@/services/assistant";
import type { AssistantCard, AssistantStatus } from "@/types/assistant";

const EVERYONE = "Show me the people who applied";

type Choice = { icon: LucideIcon; label: string; text?: string; hint: string };

// The four things Simple Hire is for. Each one either asks the assistant straight away or says what to say.
const CHOICES: Choice[] = [
  {
    icon: Megaphone,
    label: "Post a job",
    hint: "Tell me about the job: what it is, the pay, the days and how many people. For example: “A cashier, $16 an hour, weekend shifts.”",
  },
  { icon: Users, label: "See applicants", text: EVERYONE, hint: "Here's who applied. Tick anyone to contact them." },
  {
    icon: MessageCircle,
    label: "Contact candidates",
    text: EVERYONE,
    hint: "Tick the people you want to contact, then press Message them or Phone numbers.",
  },
  {
    icon: CalendarPlus,
    label: "Schedule interview",
    text: EVERYONE,
    hint: "Tick the people you'd like to meet, then press Ask to interview and say when.",
  },
];

/**
 * Simple Hire's home: "What would you like to do?", one large button to talk to Kavuntra, and the four
 * things it's for. Talking and typing go to the same assistant as the full workspace (/assistant/requests),
 * so a job, a list of applicants, their phone numbers, messages and interview requests all come back for the
 * owner to see, and nothing is posted or sent until they press the button that does it.
 */
export function HireAssistant({ start = null }: { start?: "post" | null }) {
  const { user, refresh } = useWorkspace();
  const router = useRouter();
  const showChanges = useCallback(
    (card: AssistantCard) => {
      if (card.type === "job_draft" && card.stage === "created") router.refresh();
      if (card.type === "outreach" || card.type === "message") refresh().catch(() => undefined);
    },
    [refresh, router],
  );
  const assistant = useAssistant(undefined, showChanges);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getAssistantStatus().then(setStatus, () => setStatus(null));
  }, []);

  // From the Jobs page's Post a job: ready to describe it.
  const started = useRef(false);
  useEffect(() => {
    if (start !== "post" || started.current) return;
    started.current = true;
    queueMicrotask(() => {
      setOpen(true);
      setHint(CHOICES[0].hint);
      queueMicrotask(() => textarea.current?.focus());
    });
  }, [start]);

  const voice = useVoiceInput({
    serverTranscription: status?.voice_transcription ?? false,
    onTranscript: async (text, session) => {
      setHint(null);
      const response = await assistant.send(text, "voice");
      if (!response) {
        voice.fail(session, "Kavuntra couldn't answer just now. Try again, or type it.");
        return;
      }
      voice.responded(session, response.status === "completed" || handledCards(response).length > 0);
    },
  });
  const listening = voice.state.phase === "listening";
  const noMic = voice.engine === "unsupported";

  function talk() {
    setOpen(true);
    if (noMic) {
      queueMicrotask(() => textarea.current?.focus());
      return;
    }
    voice.press();
  }

  function choose(choice: Choice) {
    setOpen(true);
    setHint(choice.hint);
    if (choice.text) void assistant.send(choice.text);
    else queueMicrotask(() => textarea.current?.focus());
  }

  function type(text: string) {
    setOpen(true);
    setHint(null);
    void assistant.send(text, "text");
  }

  const actions: CardActions = {
    onConfirm: assistant.confirm,
    onCancel: assistant.cancel,
    onSend: (text, context) => {
      setHint(null);
      void assistant.send(text, "text", context);
    },
    onSelect: assistant.setSelection,
    onEdits: assistant.reportEdits,
    busy: assistant.pending,
  };

  const mic = (
    <button
      type="button"
      onClick={() => voice.press()}
      aria-pressed={listening}
      aria-label={listening ? "Stop listening" : "Say it"}
      title={noMic ? "Voice isn't supported in this browser: type it instead" : undefined}
      disabled={noMic}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand transition-transform active:scale-95 disabled:opacity-40",
        listening && "ring-4 ring-brand/50",
      )}
    >
      {noMic ? (
        <MicOff aria-hidden className="size-5" />
      ) : (
        <Mic aria-hidden className={cn("size-5", listening && "animate-pulse")} />
      )}
    </button>
  );

  if (!open) {
    return (
      <div className="flex flex-col items-center pt-6 text-center sm:pt-12">
        <p className="text-[15px] font-medium text-stone">Hi {firstName(user.name)}</p>
        <h1 className="mt-2 text-[clamp(34px,5vw,56px)] leading-[1.04] font-semibold tracking-[-0.04em] text-ink">
          What would you like to do?
        </h1>
        <button
          type="button"
          onClick={talk}
          className="group mt-10 flex flex-col items-center gap-4 rounded-[32px] p-2 focus-visible:outline-offset-4"
          aria-label="Talk to Kavuntra"
        >
          <span className="flex size-32 items-center justify-center rounded-full bg-brand text-on-brand shadow-raised ring-[12px] ring-accent/35 transition-transform duration-300 group-hover:scale-[1.03] group-active:scale-95 sm:size-36">
            {noMic ? <Sparkles aria-hidden className="size-11" /> : <Mic aria-hidden className="size-11" />}
          </span>
          <span className="text-base font-semibold text-ink">{noMic ? "Ask Kavuntra" : "Tap and say it"}</span>
        </button>
        <ul className="mt-12 grid w-full max-w-2xl grid-cols-2 gap-3 sm:gap-4">
          {CHOICES.map((choice) => (
            <li key={choice.label}>
              <button
                type="button"
                onClick={() => choose(choice)}
                className="flex min-h-[116px] w-full flex-col items-start justify-between gap-3 rounded-[22px] bg-surface-raised p-4 text-left shadow-soft ring-1 ring-ink/[0.06] transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:bg-overlay hover:shadow-raised sm:min-h-[136px] sm:p-5"
              >
                <span className="flex size-10 items-center justify-center rounded-[12px] bg-accent-soft/70">
                  <choice.icon aria-hidden className="size-5 text-brand-ink" strokeWidth={1.75} />
                </span>
                <span className="text-lg font-semibold text-ink">{choice.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-8 w-full max-w-2xl text-left">
          <AIComposer
            id="hire-start"
            label="Or type what you'd like to do"
            placeholder="Or type it: “Post a cashier job paying $16 an hour for weekend shifts”"
            suggestions={[]}
            pending={assistant.pending}
            onSend={type}
          />
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Kavuntra assistant" className="flex flex-col">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Back to the start">
          <ArrowLeft />
        </Button>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-[30px]">
          What would you like to do today?
        </h1>
      </div>
      <p className="mt-1 ml-12 text-sm text-stone" aria-live="polite">
        {listening || voice.state.phase !== "idle"
          ? voice.state.transcript
            ? `“${voice.state.transcript}”`
            : VOICE_LABELS[voice.state.phase]
          : "Say it or type it. Nothing is posted or sent until you press the button that does it."}
      </p>
      {voice.state.phase === "error" && voice.state.error && (
        <p className="mt-1 ml-12 text-sm text-danger">{voice.state.error}</p>
      )}

      {(assistant.context.selected_application_ids?.length ?? 0) > 0 && (
        <div className="mt-4 flex w-fit items-center gap-2 rounded-full bg-accent-soft/70 py-1 pr-1 pl-3 text-sm text-ink ring-1 ring-brand-ink/15">
          {assistant.context.selected_application_ids?.length} chosen: what you ask next is about them
          <button
            type="button"
            onClick={() => assistant.setSelection([])}
            aria-label="Clear the people chosen"
            className="rounded-full p-1 text-stone hover:bg-ink/10 hover:text-ink"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}

      <Conversation turns={assistant.turns} actions={actions} hint={hint} />

      <div className="sticky bottom-20 z-10 mt-6 rounded-[22px] bg-overlay/95 p-3 shadow-raised ring-1 ring-ink/[0.07] backdrop-blur-xl md:bottom-4">
        <AIComposer
          id="hire-prompt"
          label="Say or type what you'd like to do"
          placeholder="Type it here…"
          suggestions={[]}
          pending={assistant.pending}
          onSend={type}
          textareaRef={textarea}
          extraActions={mic}
        />
      </div>
    </section>
  );
}

function Conversation({ turns, actions, hint }: { turns: AssistantTurn[]; actions: CardActions; hint: string | null }) {
  const end = useRef<HTMLDivElement>(null);
  const last = turns.at(-1);
  // A proposal changed further down (the job edited, times added) shows only its latest card.
  const latest = useMemo(() => {
    const where = new Map<string, string>();
    for (const turn of turns) {
      if (turn.role !== "assistant" || turn.status !== "done") continue;
      for (const card of turn.response.cards) if ("action_id" in card) where.set(card.action_id, turn.id);
    }
    return where;
  }, [turns]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, last]);

  return (
    <div
      role="log"
      aria-label="Conversation"
      aria-live="polite"
      aria-busy={last?.role === "assistant" && last.status === "thinking"}
      className="mt-6 flex flex-col gap-5"
    >
      {turns.map((turn) =>
        turn.role === "user" ? (
          <p
            key={turn.id}
            className="flex max-w-[85%] animate-rise items-start gap-1.5 self-end rounded-[20px] rounded-br-[6px] bg-brand px-4 py-2.5 text-base text-on-brand"
          >
            {turn.inputType === "voice" && <Mic aria-label="Spoken" className="mt-1 size-4 shrink-0 text-on-brand/70" />}
            <span>{turn.text}</span>
          </p>
        ) : (
          <div key={turn.id} className="flex animate-rise gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-overlay ring-1 ring-ink/10">
              <KavuntraMark className="h-4" />
            </span>
            <div className="min-w-0 flex-1 text-[15px] leading-relaxed text-charcoal">
              {turn.status === "thinking" ? (
                <span className="inline-flex h-7 items-center gap-1">
                  <span className="sr-only">Working…</span>
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      aria-hidden
                      className="size-2 animate-pulse rounded-full bg-brand/50"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </span>
              ) : turn.status === "error" ? (
                <p className="text-danger">{turn.error}</p>
              ) : (
                <>
                  <AIMessageContent text={turn.response.reply} />
                  {turn.response.cards.map((card, index) => (
                    <SimpleCardView
                      key={`${card.type}-${"action_id" in card ? card.action_id : index}`}
                      card={card}
                      actions={actions}
                      superseded={"action_id" in card && latest.get(card.action_id) !== turn.id}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        ),
      )}
      {hint && (
        <p className="flex items-start gap-3 rounded-[18px] border border-dashed border-border-strong px-4 py-3 text-[15px] text-stone">
          <Sparkles aria-hidden className="mt-1 size-4 shrink-0 text-brand-ink" />
          {hint}
        </p>
      )}
      <div ref={end} />
    </div>
  );
}
