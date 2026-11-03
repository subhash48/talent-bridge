"use client";

import { ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { cn } from "@/lib/utils";

export const CONCIERGE_PLACEHOLDER = "Who would make your day easier?";

/**
 * The hero's hiring concierge: one line to say what you need, and nothing around it. What you type goes with you
 * to Get started (/start?need=...).
 */
export function Concierge({ className }: { className?: string }) {
  const router = useRouter();
  const [need, setNeed] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = need.trim();
    router.push(trimmed ? `/start?need=${encodeURIComponent(trimmed)}` : "/start");
  }

  return (
    <form onSubmit={submit} aria-label="Your hiring concierge" className={cn("mx-auto w-full max-w-[720px]", className)}>
      <div className="flex items-center gap-2 rounded-full border border-ink/10 bg-white/80 py-1 pr-1 pl-4 transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
        <label htmlFor="concierge-need" className="sr-only">
          {CONCIERGE_PLACEHOLDER}
        </label>
        <input
          id="concierge-need"
          name="need"
          value={need}
          onChange={(event) => setNeed(event.target.value)}
          placeholder={CONCIERGE_PLACEHOLDER}
          autoComplete="off"
          className="h-9 min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-stone focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Get started"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-brand transition-[background-color,transform] duration-200 hover:bg-brand-hover active:scale-95"
        >
          <ArrowUp aria-hidden className="size-4" strokeWidth={2.25} />
        </button>
      </div>
    </form>
  );
}
