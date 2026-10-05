"use client";

import { Mic, RotateCcw, Square, X } from "lucide-react";

import { AIMessageContent } from "@/components/ai/AIMessageContent";
import { AssistantCardView, type CardActions } from "@/components/recruiter/assistant/AssistantCards";
import { Button } from "@/components/ui/Button";
import { VOICE_LABELS, type VoiceState } from "@/lib/voice";
import { cn } from "@/lib/utils";
import type { AssistantResponse } from "@/types/assistant";

type VoicePanelProps = {
  state: VoiceState;
  levels: number[];
  /** The assistant's answer to this session's request, once it has one. */
  response: AssistantResponse | null;
  actions: CardActions;
  onMic: () => void;
  onClose: () => void;
};

const WORKING = new Set(["understanding", "preparing", "executing"]);

/**
 * The voice interaction: what the assistant is doing, a quiet waveform while it listens, the words it
 * heard, and the answer or the action to confirm. A compact panel on larger screens and a bottom sheet
 * on phones; the same conversation shows in the thread behind it.
 */
export function VoicePanel({ state, levels, response, actions, onMic, onClose }: VoicePanelProps) {
  const listening = state.phase === "listening";
  const working = WORKING.has(state.phase);
  const card = response?.cards[0];

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label="Voice assistant"
      className="fixed inset-x-0 bottom-0 z-40 max-h-[85dvh] animate-rise overflow-y-auto rounded-t-[18px] border-t border-border-strong bg-surface/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-24px_60px_-20px_rgb(0_0_0/0.85)] backdrop-blur-md md:inset-x-auto md:right-6 md:bottom-6 md:w-[392px] md:rounded-[16px] md:border md:pb-4"
    >
      <div aria-hidden className="mx-auto mb-2 h-1 w-9 rounded-full bg-ink/15 md:hidden" />
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Constellation active={listening || working} />
          <p className="text-sm font-medium text-ink" aria-live="polite">
            {VOICE_LABELS[state.phase]}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close voice and cancel">
          <X />
        </Button>
      </header>

      <Waveform levels={levels} active={listening} working={working} />

      <p className={cn("min-h-10 text-[15px] leading-snug", state.transcript ? "text-ink" : "text-faint")}>
        {state.transcript ? <>&ldquo;{state.transcript}&rdquo;</> : listening ? "Say what you'd like to do…" : " "}
      </p>

      {state.phase === "error" && state.error && <p className="mt-2 text-sm text-danger">{state.error}</p>}

      {response && (state.phase === "ready" || state.phase === "executing" || state.phase === "complete") && (
        <div className="mt-3 border-t border-border pt-3 text-sm text-charcoal">
          <AIMessageContent text={response.reply} />
          {card && <AssistantCardView card={card} actions={actions} />}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        {listening ? (
          <Button size="sm" onClick={onMic}>
            <Square aria-hidden className="fill-current" /> Stop
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled={working || state.phase === "starting"} onClick={onMic}>
            {state.phase === "error" ? <RotateCcw aria-hidden /> : <Mic aria-hidden />}
            {state.phase === "error" ? "Try again" : "Speak again"}
          </Button>
        )}
      </div>
    </section>
  );
}

/** A quiet waveform: ivory bars that follow the microphone's level while listening. */
function Waveform({ levels, active, working }: { levels: number[]; active: boolean; working: boolean }) {
  return (
    <div aria-hidden className="my-3 flex h-12 items-center justify-center gap-[3px]">
      {levels.map((level, index) => (
        <span
          key={index}
          className={cn("w-[3px] rounded-full bg-ink transition-[height,opacity] duration-100", working && "animate-pulse")}
          style={{
            height: `${active ? Math.max(3, level * 44) : working ? 6 + ((index * 7) % 10) : 3}px`,
            opacity: active ? 0.35 + level * 0.65 : 0.25,
          }}
        />
      ))}
    </div>
  );
}

/** Three stars joined by faint lines, from the sign-in page's night sky. They brighten while it works. */
function Constellation({ active }: { active: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 28 20" className={cn("h-5 w-7 text-ink transition-opacity duration-300", active ? "opacity-100" : "opacity-50")}>
      <path d="M3 15L12 5L25 9" stroke="currentColor" strokeWidth={0.8} opacity={0.35} fill="none" />
      {[
        [3, 15],
        [12, 5],
        [25, 9],
      ].map(([cx, cy], index) => (
        <circle key={index} cx={cx} cy={cy} r={1.6} fill="currentColor" className={active ? "animate-pulse" : undefined} style={{ animationDelay: `${index * 180}ms` }} />
      ))}
    </svg>
  );
}
