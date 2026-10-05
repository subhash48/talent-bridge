"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

import { suggestionChipStyles } from "@/components/ai/AIComposer";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { rememberAskAIQuestion } from "@/lib/ask-ai";
import { cn } from "@/lib/utils";

type AskAIEntryProps = {
  title?: string;
  description: string;
  /** Suggested questions (from lib/ask-ai.ts); each opens Ask AI and asks it. */
  prompts: readonly string[];
  className?: string;
};

/** A small way into Ask AI. The conversation itself has its own page. */
export function AskAIEntry({ title = "Ask AI", description, prompts, className }: AskAIEntryProps) {
  return (
    <Card className={cn("flex flex-col gap-3 p-5 sm:p-5 xl:flex-row xl:items-center xl:justify-between", className)}>
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] ring-1 ring-ink/10">
          <Sparkles aria-hidden className="size-4 text-ink" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
          <p className="text-[13px] text-stone">{description}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        {prompts.map((prompt) => (
          <Link key={prompt} href="/candidate/ai" onClick={() => rememberAskAIQuestion(prompt)} className={suggestionChipStyles}>
            {prompt}
          </Link>
        ))}
        <Link href="/candidate/ai" className={buttonStyles({ variant: "ai", size: "sm" })}>
          Ask AI <ArrowRight />
        </Link>
      </div>
    </Card>
  );
}
