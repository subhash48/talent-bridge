"use client";

import { ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { HirvelloMark } from "@/components/shared/HirvelloLogo";
import { cn } from "@/lib/utils";

export const CONCIERGE_PLACEHOLDER = "Tell us what you're looking for...";
const PROMISE = "We'll guide you to the right place.";

/**
 * The home page's concierge: the mark, one question, one line to answer it and a word on what happens next. What
 * you type goes with you to Get started (/start?need=...). The line sits on the sky itself: pale, translucent, with
 * a hairline and a soft shadow, and no card around it.
 */
export function Concierge({ className }: { className?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    router.push(trimmed ? `/start?need=${encodeURIComponent(trimmed)}` : "/start");
  }

  return (
    <div className={cn("mx-auto w-full max-w-[880px] text-center", className)}>
      <HirvelloMark className="mx-auto h-14 sm:h-16" />
      <h2 className="mt-5 text-[clamp(28px,3.4vw,44px)] leading-[1.1] font-bold tracking-[-0.03em] text-ink">How can Hirvello help you?</h2>

      <form onSubmit={submit} aria-label="Your hiring concierge" className="mt-7 sm:mt-8">
        <div className="flex items-center gap-2 rounded-full border border-white/70 bg-white/35 py-1.5 pr-1.5 pl-5 shadow-[0_1px_2px_rgb(16_33_61/0.04),0_16px_40px_-18px_rgb(16_33_61/0.22)] backdrop-blur-md transition-[border-color,box-shadow] duration-150 focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/15 sm:py-2 sm:pr-2 sm:pl-6">
          <label htmlFor="concierge-need" className="sr-only">
            What are you looking for?
          </label>
          <input
            id="concierge-need"
            name="need"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={CONCIERGE_PLACEHOLDER}
            autoComplete="off"
            enterKeyHint="go"
            className="h-11 min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-ink/60 focus:outline-none sm:h-12 sm:text-[17px]"
          />
          <button
            type="submit"
            aria-label="Continue"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-brand shadow-[0_8px_20px_-10px_rgb(50_102_255/0.8)] transition-[background-color,transform] duration-200 hover:bg-brand-hover active:scale-95 sm:size-12"
          >
            <ArrowUp aria-hidden className="size-5" strokeWidth={2.25} />
          </button>
        </div>
        <p className="mt-4 text-[14px] text-charcoal sm:text-[15px]">{PROMISE}</p>
      </form>
    </div>
  );
}
