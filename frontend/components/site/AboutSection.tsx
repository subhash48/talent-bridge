import Link from "next/link";

import { Section } from "@/components/site/Section";
import { SOLUTIONS } from "@/components/site/nav";

// Who Kavuntra is for, with a line each, in the words of their own pages.
const SERVED = [
  { ...SOLUTIONS[0], who: "Recruiting teams", line: "that want to stay responsive as the pipeline grows." },
  { ...SOLUTIONS[1], who: "Candidates", line: "who want to know where they stand and how to prepare." },
  { ...SOLUTIONS[2], who: "Small businesses", line: "that need to hire without learning recruiting software." },
];

// The page's chapters: a short label, then the words. No customers, numbers, funding or history: none to claim.
const CHAPTERS = [
  {
    title: "Why Kavuntra exists",
    text: "Hiring runs on communication, and that is where it most often breaks down. Recruiting systems help companies manage hiring internally, but candidates are often left without clear updates or next steps, and recruiters rarely have a simple way to see who has been waiting. Kavuntra exists to close that gap.",
  },
  {
    title: "The problem we’re solving",
    text: "Silence. A candidate applies, interviews, and then hears nothing for days. On the other side, a recruiter with dozens of open conversations has no reliable way to know which of them have gone quiet. Neither side is at fault: the tools were built to manage the process, not the conversation.",
  },
  {
    title: "Our approach",
    text: "Kavuntra works on the communication layer of hiring. It notices when a conversation has gone quiet, drafts the next update for a recruiter to review, and shows each candidate where they stand and what comes next. People stay in control: nothing is sent, posted or decided without someone saying yes.",
  },
];

/** What Kavuntra is for, as an editorial page: a headline, a few chapters, who it serves, and the way to reach us. */
export function AboutSection() {
  return (
    <Section
      level="h1"
      id="about"
      eyebrow="About"
      title="Making hiring more human."
      intro="Kavuntra is building a better hiring experience for employers and candidates. We help hiring teams communicate clearly, reduce unnecessary waiting, and give candidates visibility into what happens next."
    >
      <div className="mt-16 border-t border-ink/[0.08]">
        {CHAPTERS.map((chapter) => (
          <div key={chapter.title} className="grid gap-3 border-b border-ink/[0.08] py-10 md:grid-cols-[220px_1fr] md:gap-12">
            <h2 className="text-[12px] font-semibold tracking-[0.18em] text-brand-ink/80 uppercase md:pt-1.5">{chapter.title}</h2>
            <p className="max-w-[640px] text-[17px] leading-relaxed text-charcoal">{chapter.text}</p>
          </div>
        ))}
        <div className="grid gap-3 border-b border-ink/[0.08] py-10 md:grid-cols-[220px_1fr] md:gap-12">
          <h2 className="text-[12px] font-semibold tracking-[0.18em] text-brand-ink/80 uppercase md:pt-1.5">Who we serve</h2>
          <ul className="flex max-w-[640px] flex-col gap-4">
            {SERVED.map(({ href, who, line, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="group flex items-start gap-3.5 rounded-md text-[17px] leading-relaxed text-charcoal">
                  <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-accent-soft/80 text-brand-ink">
                    <Icon aria-hidden className="size-3.5" strokeWidth={1.75} />
                  </span>
                  <span>
                    <span className="font-medium text-ink group-hover:underline group-hover:underline-offset-4">{who}</span> {line}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
