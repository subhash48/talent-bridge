"use client";

import { Check, Copy, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AIMessageContent } from "@/components/ai/AIMessageContent";
import type { AIMessage } from "@/hooks/useCandidateAI";
import { cn } from "@/lib/utils";

export function AIThread({ messages, className }: { messages: AIMessage[]; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const last = messages.at(-1);
  const busy = last?.status === "thinking" || last?.status === "streaming";

  // Follow the answer as it streams in.
  useEffect(() => {
    const container = containerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages.length, last?.content]);

  return (
    <div
      ref={containerRef}
      role="log"
      aria-label="AI conversation"
      aria-live="polite"
      aria-busy={busy}
      className={cn("flex flex-col gap-4 overflow-y-auto overscroll-contain pr-1", className)}
    >
      {messages.map((message) =>
        message.role === "user" ? (
          <p
            key={message.id}
            className="max-w-[85%] animate-rise self-end rounded-[14px] rounded-br-[5px] bg-white/[0.09] px-3.5 py-2 text-sm text-ink"
          >
            {message.content}
          </p>
        ) : (
          <AssistantMessage key={message.id} message={message} />
        ),
      )}
    </div>
  );
}

function AssistantMessage({ message }: { message: AIMessage }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content.replace(/\*\*/g, ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex animate-rise gap-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ai/15 ring-1 ring-ai/30">
        <Sparkles aria-hidden className="size-3.5 text-ai" />
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-charcoal">
        {message.status === "thinking" ? (
          <span className="inline-flex h-6 items-center gap-1">
            <span className="sr-only">Thinking…</span>
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                aria-hidden
                className="size-1.5 animate-pulse rounded-full bg-ai/70"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
        ) : message.status === "error" ? (
          <p className="text-red-200">{message.content}</p>
        ) : (
          <AIMessageContent text={message.content} streaming={message.status === "streaming"} />
        )}

        {message.status === "done" && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
            {message.sources?.map((source) => (
              <span key={`${source.type}-${source.id}`} className="rounded-full bg-white/[0.04] px-2 py-0.5 ring-1 ring-white/[0.06]">
                {source.label}
              </span>
            ))}
            <button
              type="button"
              onClick={copy}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-stone transition-colors hover:bg-white/[0.06] hover:text-ink"
            >
              {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
