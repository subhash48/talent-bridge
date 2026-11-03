import { Check } from "lucide-react";

import { PreviewFrame } from "@/components/site/home/previews/PreviewFrame";
import { cn } from "@/lib/utils";

// Where one application stands, as the candidate sees it: what's done, where it is now, and what comes next.
const UPDATES: { label: string; when: string | null; state: "done" | "now" | "next" }[] = [
  { label: "Application received", when: "Mar 4, 10:24 AM", state: "done" },
  { label: "Under review", when: "Mar 5, 3:10 PM", state: "done" },
  { label: "Interview scheduled", when: "Mar 7, 11:00 AM", state: "now" },
  { label: "Next: Decision", when: null, state: "next" },
];

/** Step three, from the candidate portal: one application's updates, from received to what happens next. */
export function UpdatesPreview() {
  return (
    <PreviewFrame
      label="The candidate portal: an application's updates, from application received and under review to an interview scheduled, with the decision next"
      tabs={["Applications", "Interviews", "Messages"]}
      active="Applications"
    >
      <p className="text-[1.1em] font-semibold tracking-[-0.01em]">Application updates</p>
      <ol className="relative mt-[0.6em] flex flex-col gap-[0.1em] rounded-[10px] bg-surface/70 p-[0.35em] ring-1 ring-ink/[0.06]">
        {/* The line the steps hang on. */}
        <span aria-hidden className="absolute top-[1.4em] bottom-[1.4em] left-[1.5em] w-px bg-accent/30" />
        {UPDATES.map(({ label, when, state }) => (
          <li
            key={label}
            className={cn("relative flex items-center gap-[0.75em] rounded-[8px] px-[0.55em] py-[0.3em]", state === "now" && "bg-sky/80")}
          >
            <span
              className={cn(
                "flex size-[1.3em] shrink-0 items-center justify-center rounded-full",
                state === "done" && "bg-accent text-on-brand",
                state === "now" && "bg-accent-soft ring-[0.16em] ring-accent ring-inset",
                state === "next" && "bg-accent-soft ring-[0.12em] ring-ink/20 ring-inset",
              )}
            >
              {state === "done" && <Check className="size-[0.8em]" strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-[0.92em] font-semibold", state === "now" && "text-brand-ink", state === "next" && "font-medium text-stone")}>
                {label}
              </span>
              {when && <span className="block text-[0.84em] leading-tight text-stone">{when}</span>}
            </span>
          </li>
        ))}
      </ol>
    </PreviewFrame>
  );
}
