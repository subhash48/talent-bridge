import { Check, Minus, UserRound } from "lucide-react";

import { PreviewFrame } from "@/components/site/home/previews/PreviewFrame";

// The recruiter's criteria for the role, and what each application shows: ✓ shown, – not shown. Made-up people.
const ROWS: { criterion: string; a: string | boolean; b: string | boolean }[] = [
  { criterion: "Skills", a: "UI design, Figma", b: "UI design, Web" },
  { criterion: "Portfolio", a: true, b: true },
  { criterion: "Work samples", a: true, b: false },
  { criterion: "Relevant experience", a: true, b: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (typeof value === "string") return <span className="leading-tight">{value}</span>;
  return value ? <Check className="size-[1.15em] text-accent" strokeWidth={2.5} /> : <Minus className="size-[1.1em] text-faint" strokeWidth={2.25} />;
}

/**
 * Step two, from the recruiter's workspace: the evidence behind two matches, criterion by criterion, each ✓ taken
 * from the person's own application and each – a criterion it doesn't show. The workspace lists this under each
 * candidate; here it's set side by side. Never a score.
 */
export function EvidencePreview() {
  return (
    <PreviewFrame
      label="The recruiter workspace: two candidates' evidence side by side, criterion by criterion, with what each application shows and what it doesn't"
      tabs={["Jobs", "Candidates", "Messages"]}
      active="Candidates"
    >
      <p className="text-[1.1em] font-semibold tracking-[-0.01em]">Candidate evidence</p>
      <div className="mt-[0.6em] overflow-hidden rounded-[10px] bg-surface/70 text-[0.88em] ring-1 ring-ink/[0.06]">
        <div className="grid grid-cols-[1.15fr_1fr_1fr] border-b border-ink/[0.07]">
          <span />
          {["Candidate A", "Candidate B"].map((name) => (
            <span key={name} className="flex items-center gap-[0.45em] border-l border-ink/[0.07] px-[0.6em] py-[0.55em] font-medium whitespace-nowrap">
              <span className="flex size-[1.6em] shrink-0 items-center justify-center rounded-full bg-sky text-brand-ink">
                <UserRound className="size-[0.95em]" strokeWidth={2} />
              </span>
              {name}
            </span>
          ))}
        </div>
        {ROWS.map(({ criterion, a, b }) => (
          <div key={criterion} className="grid grid-cols-[1.15fr_1fr_1fr] border-b border-ink/[0.07] last:border-b-0">
            <span className="px-[0.6em] py-[0.5em] leading-tight text-charcoal">{criterion}</span>
            {[a, b].map((value, index) => (
              <span key={index} className="flex items-center justify-center border-l border-ink/[0.07] px-[0.5em] py-[0.5em] text-center text-charcoal">
                <Cell value={value} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}
