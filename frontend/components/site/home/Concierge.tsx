"use client";

import { ArrowUp, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { HirvelloMark } from "@/components/shared/HirvelloLogo";
import { RoleChoice } from "@/components/site/home/RoleChoice";
import { classifyIntent, INTENT_MAX_LENGTH, INTENT_PATHS } from "@/lib/intent";
import { cn } from "@/lib/utils";

export const CONCIERGE_PLACEHOLDER = "Tell us what you're looking for...";
const EMPTY = "Tell us a little about what you need first.";
const PROMISE = "We'll guide you to the right place.";

/**
 * The home page's concierge: the mark, one question, one line to answer it and a word on what happens next. What
 * you type is read here, in the browser, for whether you're a recruiter, a small-business owner or a job seeker
 * (lib/intent.ts), and that sign-in or onboarding flow opens. When the words don't say, a small dialog asks.
 * Nothing typed is sent or kept, and nothing here signs anyone in: the flows it opens ask for that as they always
 * have. The line sits on the sky itself: pale, translucent, with a hairline and a soft shadow, and no card around it.
 */
export function Concierge({ className }: { className?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [asking, setAsking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();

  // The three places it can lead are fetched ahead, so the move is quick.
  useEffect(() => {
    for (const path of Object.values(INTENT_PATHS)) router.prefetch(path);
  }, [router]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setProblem(EMPTY);
      input.current?.focus();
      return;
    }
    setProblem(null);
    const intent = classifyIntent(trimmed);
    if (!intent) {
      setAsking(true);
      return;
    }
    setPending(true);
    router.push(INTENT_PATHS[intent]);
  }

  return (
    <div className={cn("mx-auto w-full max-w-[880px] text-center", className)}>
      <HirvelloMark className="mx-auto h-14 sm:h-16" />
      <h2 className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.03em] text-ink">How can Hirvello help you?</h2>

      <form onSubmit={submit} noValidate aria-label="Your hiring concierge" className="mt-7 sm:mt-8">
        <div
          className={cn(
            "flex items-center gap-2 rounded-full border bg-white/35 py-1.5 pr-1.5 pl-5 shadow-[0_1px_2px_rgb(16_33_61/0.04),0_16px_40px_-18px_rgb(16_33_61/0.22)] backdrop-blur-md transition-[border-color,box-shadow] duration-150 focus-within:ring-4 focus-within:ring-accent/15 sm:py-2 sm:pr-2 sm:pl-6",
            problem ? "border-danger/50" : "border-white/70 focus-within:border-accent/50",
          )}
        >
          <label htmlFor="concierge-need" className="sr-only">
            What are you looking for?
          </label>
          <input
            ref={input}
            id="concierge-need"
            name="need"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (problem) setProblem(null);
            }}
            placeholder={CONCIERGE_PLACEHOLDER}
            autoComplete="off"
            maxLength={INTENT_MAX_LENGTH}
            enterKeyHint="go"
            aria-invalid={problem ? true : undefined}
            aria-describedby={hintId}
            className="h-11 min-w-0 flex-1 bg-transparent text-[1rem] text-ink placeholder:text-ink/60 focus:outline-none sm:h-12 sm:text-[1.0625rem]"
          />
          <button
            type="submit"
            aria-label="Continue"
            disabled={pending}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-brand shadow-[0_8px_20px_-10px_rgb(50_102_255/0.8)] transition-[background-color,transform] duration-200 hover:bg-brand-hover active:scale-95 disabled:cursor-progress disabled:hover:bg-accent sm:size-12"
          >
            {pending ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : <ArrowUp aria-hidden className="size-5" strokeWidth={2.25} />}
          </button>
        </div>
        <p id={hintId} aria-live="polite" className={cn("mt-4 text-[0.875rem] sm:text-[0.9375rem]", problem ? "text-danger" : "text-charcoal")}>
          {problem ?? (pending ? "One moment…" : PROMISE)}
        </p>
      </form>

      <RoleChoice open={asking} onClose={() => setAsking(false)} />
    </div>
  );
}
