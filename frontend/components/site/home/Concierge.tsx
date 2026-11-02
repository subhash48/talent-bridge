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
      aria-label="Your hiring concierge"
      className={cn(
        "mx-auto w-full max-w-[720px] rounded-[20px] border border-accent/15 bg-white/70 p-4 text-left shadow-[0_2px_6px_rgb(16_33_61/0.04),0_28px_64px_-32px_rgb(50_102_255/0.5)] backdrop-blur-xl sm:p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2.5 text-[14px] font-semibold text-ink">
          <HirvelloMark className="h-6" />
          Your hiring concierge
        </p>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-brand-ink uppercase">
          Preview
        </span>
      </div>

      {/* The example conversation. Decorative for screen readers: the line below is the part that does something. */}
      <div aria-hidden className="mt-4 flex flex-col gap-2.5">
        <p className="max-w-[85%] self-end rounded-[16px] rounded-br-[6px] bg-accent px-3.5 py-2.5 text-[14px] leading-snug text-on-brand">
          {ASKED}
        </p>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-brand-ink">
            <Sparkles className="size-3.5" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="w-fit max-w-[85%] rounded-[16px] rounded-tl-[6px] bg-white/80 px-3.5 py-2.5 text-[14px] leading-snug text-charcoal ring-1 ring-ink/[0.06]">
              {ANSWERED}
            </p>
            <ol className="mt-2.5 flex flex-col gap-2">
              {EXAMPLE.map((person, index) => (
                <li key={person.name} className="flex items-center gap-3 rounded-[14px] bg-white/80 px-3 py-2.5 ring-1 ring-ink/[0.06]">
                  <span className="w-3 text-[12px] font-semibold text-faint tabular-nums">{index + 1}</span>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky text-[11px] font-semibold text-brand-ink">
                    {initials(person.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[14px] font-semibold text-ink">{person.name}</span>
                      <span className="text-[12.5px] text-stone">{person.role}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-charcoal">
                      <span className="rounded-full bg-success/[0.08] px-2 py-0.5 text-[11px] font-semibold text-success">Evidence</span>
                      {person.evidence}
                      <span className="hidden gap-1.5 sm:inline-flex">
                        {person.skills.map((skill) => (
                          <span key={skill} className="rounded-full bg-accent-soft/70 px-2 py-0.5 text-[11px] font-medium text-brand-ink">
                            {skill}
                          </span>
                        ))}
                      </span>
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
                      person.fit === "Strong fit" ? "bg-success/[0.1] text-success" : "bg-accent-soft text-brand-ink",
                    )}
                  >
                    {person.fit}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-full border border-ink/10 bg-white/80 py-1 pr-1 pl-4 transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
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
