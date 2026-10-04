"use client";

import { ShieldCheck, Sparkles } from "lucide-react";
import { useId } from "react";

import { AIComposer } from "@/components/ai/AIComposer";
import { AIThread } from "@/components/ai/AIThread";
import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { Card } from "@/components/ui/Card";
import { usePortalAssistant } from "@/hooks/usePortalAssistant";
import { cn } from "@/lib/utils";

const QUICK_PROMPTS = ["What should I prepare?", "What will the interview be like?", "What questions should I ask?", "What should I review?"];

/**
 * The candidate assistant. It answers from what the candidate can already see (their application,
 * interviews, messages and the job posting), never the hiring team's notes or decisions.
 */
export function AskAssistant({ className }: { className?: string }) {
  const composerId = useId();
  const { applicationId } = useCandidatePortal();
  const { messages, pending, send, stop } = usePortalAssistant(applicationId);

  return (
    <Card className={cn("flex flex-col p-5 sm:p-6", className)}>
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-ai/15 ring-1 ring-ai/30">
          <Sparkles aria-hidden className="size-4 text-ai" />
        </span>
        <div>
          <h2 className="font-semibold tracking-tight text-ink">Ask AI</h2>
          <p className="text-[13px] text-stone">Ask about your interview or application</p>
        </div>
      </div>

      {messages.length > 0 && <AIThread messages={messages} className="mt-5 max-h-[420px] min-h-[120px]" />}

      <AIComposer
        id={composerId}
        label="Ask the AI assistant"
        placeholder="Ask what to prepare, what to expect, or how to get ready..."
        suggestions={messages.length > 0 ? [] : QUICK_PROMPTS}
        pending={pending}
        onSend={(prompt) => void send(prompt)}
        onStop={stop}
        className="mt-5"
      />
      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-faint">
        <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0" />
        Uses only what you can see in this portal. Your recruiter sees the topic you asked about, never your question.
      </p>
    </Card>
  );
}
