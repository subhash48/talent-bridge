"use client";

import { ArrowUp, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { HirvelloMark } from "@/components/shared/HirvelloLogo";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** What people most often need first. Each is a complete answer to the question. */
export const CONCIERGE_CHIPS = ["An office coordinator", "A bookkeeper", "Someone great with customers"] as const;

export const CONCIERGE_PLACEHOLDER = "Who would make your day easier?";

// An example of the concierge at work, written for this page: the people are made up, and nothing here is read
// from anyone's workspace.
const ASKED = "Find the strongest candidates for my open roles.";
const ANSWERED = "Here are 3 top candidates, ranked by fit for your roles.";
const EXAMPLE: { name: string; role: string; evidence: string; skills: string[]; fit: "Strong fit" | "Good fit" }[] = [
  {
    name: "Maya Chen",
    role: "Office coordinator",
    evidence: "Ran a 40-person front desk for 3 years",
    skills: ["Scheduling", "Vendors"],
    fit: "Strong fit",
  },
  {
    name: "Daniel Okafor",
    role: "Bookkeeper",
    evidence: "Closed the monthly books at a 60-person firm",
    skills: ["QuickBooks", "Payroll"],
    fit: "Strong fit",
  },
  {
    name: "Priya Raman",
    role: "Customer support lead",
    evidence: "4.9 satisfaction over 2,000 tickets",
    skills: ["Zendesk", "Onboarding"],
    fit: "Good fit",
  },
];

/**
 * The hero's hiring concierge: a card that shows one short conversation (what you ask, what it answers, the three
 * people it found with the evidence for each), then a line to ask it yourself and three answers to pick from. What
 * you type goes with you to Get started (/start?need=...), where it's remembered for Simple Hire, so it's the first
 * thing the assistant hears once you're in.
 */
export function Concierge({ className }: { className?: string }) {
  const router = useRouter();
  const [need, setNeed] = useState("");

  function go(text: string) {
    const trimmed = text.trim();
    router.push(trimmed ? `/start?need=${encodeURIComponent(trimmed)}` : "/start");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go(need);
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        "sky-card w-full max-w-[640px] rounded-[26px] p-5 text-left shadow-glow sm:p-6",
        className,
      )}
    >
      <p className="flex items-center gap-2.5 text-[13.5px] text-charcoal">
        <HirvelloMark className="h-7" />
        Your hiring concierge
      </p>
      <div className="mt-4 flex items-center gap-3">
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
          className="h-12 min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-stone focus:outline-none sm:text-[20px]"
        />
        <button
          type="submit"
          aria-label="Get started"
          className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-brand sm:size-12 text-on-brand shadow-[0_10px_24px_-12px_rgb(20_35_59/0.7)] transition-[transform,background-color] duration-200 hover:bg-brand-hover active:scale-95"
        >
          <ArrowUpRight aria-hidden className="size-5" />
        </button>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Suggestions">
        {CONCIERGE_CHIPS.map((chip) => (
          <li key={chip}>
            <button
              type="button"
              onClick={() => go(chip)}
              className="h-8 rounded-[10px] border border-border-strong/60 bg-glass-strong px-3 text-[12.5px] text-charcoal transition-colors duration-200 hover:border-accent/40 hover:bg-overlay hover:text-ink"
            >
              {chip}
            </button>
          </li>
        ))}
      </ul>
    </form>
  );
}
