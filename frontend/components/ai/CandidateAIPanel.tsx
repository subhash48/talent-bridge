"use client";

import { Maximize2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";

import { AIComposer } from "@/components/ai/AIComposer";
import { AIThread } from "@/components/ai/AIThread";
import { buttonStyles } from "@/components/ui/Button";
import type { useCandidateAI } from "@/hooks/useCandidateAI";
import { firstName, possessivePronoun } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PipelineCandidate } from "@/types/workspace";

export const AI_QUICK_PROMPTS = ["Summarize candidate", "What are good next steps?", "Draft follow-up message"];

type CandidateAIPanelProps = {
  candidate: PipelineCandidate;
  ai: ReturnType<typeof useCandidateAI>;
  /** Changing this number moves focus to the prompt box (e.g. "Ask AI" from a row menu). */
  focusKey?: number;
  className?: string;
};

/** The Copilot, scoped to one candidate and embedded where the recruiter is already working. */
export function CandidateAIPanel({ candidate, ai, focusKey, className }: CandidateAIPanelProps) {
  const headingId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const first = firstName(candidate.name);

  useEffect(() => {
    if (focusKey) textareaRef.current?.focus();
  }, [focusKey]);

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "rounded-[18px] border border-ai/15 bg-[linear-gradient(180deg,rgb(165_148_249/0.075),rgb(255_255_255/0.02))] p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="flex items-center gap-2 text-[17px] font-medium tracking-tight text-ink">
          <Sparkles aria-hidden className="size-5 text-ai" />
          Ask AI about {first}
        </h3>
        <Link
          href={`/recruiter/ai?candidate=${candidate.id}`}
          aria-label={`Open the AI Assistant for ${first}`}
          title="Open in AI Assistant"
          className={buttonStyles({ variant: "ghost", size: "icon-sm" })}
        >
          <Maximize2 />
        </Link>
      </div>
      {ai.messages.length > 0 && <AIThread messages={ai.messages} className="mt-4 max-h-60" />}
      <AIComposer
        className="mt-4"
        id={`${headingId}-prompt`}
        label={`Ask AI about ${first}`}
        placeholder={`Summarize ${possessivePronoun(candidate.pronouns)} profile, suggest next steps, or draft a message...`}
        suggestions={AI_QUICK_PROMPTS}
        pending={ai.pending}
        onSend={ai.send}
        onStop={ai.stop}
        textareaRef={textareaRef}
      />
    </section>
  );
}
