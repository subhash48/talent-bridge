import { Mic } from "lucide-react";

import { PreviewFrame } from "@/components/site/home/previews/PreviewFrame";

/**
 * Step one, as Simple Hire shows it: what the owner said, and the job it became, marked "Ready to post" with the
 * facts it heard, what it's looking for, and Post job or Edit. Nothing is posted until Post job.
 */
export function JobBriefPreview() {
  return (
    <PreviewFrame
      label="Simple Hire: a job described in a sentence, shown as a draft that's ready to post, with Post job and Edit"
      tabs={["Jobs", "Applicants", "Messages"]}
      active="Jobs"
    >
      <p className="flex items-center gap-[0.6em] rounded-full bg-surface px-[0.9em] py-[0.55em] text-[0.95em] text-charcoal ring-1 ring-ink/[0.08]">
        <span className="min-w-0 flex-1 truncate">Hiring a designer, full-time, remote</span>
        <span className="flex size-[1.6em] shrink-0 items-center justify-center rounded-full bg-accent text-on-brand">
          <Mic className="size-[0.9em]" strokeWidth={2.25} />
        </span>
      </p>
      <div className="mt-[0.75em] flex min-h-0 flex-1 flex-col rounded-[10px] bg-surface/70 px-[0.95em] py-[0.8em] ring-1 ring-ink/[0.06]">
        <p className="text-[0.85em] font-semibold text-brand-ink">Ready to post</p>
        <p className="mt-[0.15em] text-[1.25em] leading-tight font-semibold tracking-[-0.015em]">Product Designer</p>
        <p className="mt-[0.5em] flex gap-[0.4em]">
          {["Full-time", "Remote"].map((fact) => (
            <span key={fact} className="rounded-full bg-muted px-[0.65em] py-[0.15em] text-[0.85em] font-medium text-charcoal">
              {fact}
            </span>
          ))}
        </p>
        <p className="mt-[0.5em] truncate text-[0.88em] text-stone">
          <span className="font-medium text-charcoal">Looking for:</span> UI design, Figma, a portfolio
        </p>
        <p className="mt-auto flex gap-[0.4em] pt-[0.6em]">
          <span className="rounded-full bg-accent px-[0.9em] py-[0.35em] text-[0.85em] font-semibold text-on-brand">Post job</span>
          <span className="rounded-full px-[0.7em] py-[0.35em] text-[0.85em] font-semibold text-charcoal ring-1 ring-ink/15">Edit</span>
        </p>
      </div>
    </PreviewFrame>
  );
}
