import Link from "next/link";

import { Section } from "@/components/site/Section";
import { buttonStyles } from "@/components/ui/Button";

// The workspace in three parts, each a short list: the pipeline itself, keeping candidates informed, and the help
// around both. Plain rows rather than a wall of icon tiles.
const GROUPS: { title: string; items: { name: string; text: string }[] }[] = [
  {
    title: "Your pipeline",
    items: [
      { name: "Candidates by job and stage", text: "Every application in one pipeline, with filters you can share with your team." },
      { name: "Jobs", text: "Draft a job with the assistant, read it over, and open it on your careers page." },
      { name: "Interviews", text: "Propose times, book the interview and remind the candidate to confirm." },
    ],
  },
  {
    title: "Nobody left waiting",
    items: [
      { name: "Who's waiting on you", text: "Today lists the stage change nobody mentioned and the question with no reply." },
      { name: "Your own response times", text: "Decide how long a candidate may wait for news, rule by rule, and see who's past it." },
      { name: "Updates for the people you pick", text: "One message each, written from that candidate's own application, for you to approve." },
    ],
  },
  {
    title: "Help along the way",
    items: [
      { name: "An assistant you can talk to", text: "Ask in your own words, typed or spoken. It drafts and searches; nothing happens until you say yes." },
      { name: "A portal for candidates", text: "They follow their application, messages, interviews and preparation without having to email you." },
      { name: "Analytics", text: "Time between updates, messages still unanswered, and how often your team keeps to its rules." },
    ],
  },
];

/** The full recruiting workspace, for recruiting teams and growing companies. */
export function RecruitersSection() {
  return (
    <Section
      level="h1"
      id="recruiters"
      eyebrow="For recruiters"
      title="A workspace that keeps every candidate informed."
      intro="For recruiting teams and growing companies: your pipeline, and the conversations that go with it, so no candidate waits weeks without a word. Matching only uses criteria about the job that you choose, always shows its reasons, and never gives anyone a score."
    >
      <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-3 lg:gap-8">
        {GROUPS.map(({ title, items }, index) => (
          <section key={title} aria-labelledby={`recruiters-group-${index}`} className="reveal">
            <h2 id={`recruiters-group-${index}`} className="border-b border-ink/[0.12] pb-3 text-[20px] font-semibold tracking-[-0.015em] text-ink">
              {title}
            </h2>
            <dl className="divide-y divide-ink/[0.08]">
              {items.map(({ name, text }) => (
                <div key={name} className="py-4">
                  <dt className="text-[16px] font-semibold text-ink">{name}</dt>
                  <dd className="mt-1 text-[15px] leading-relaxed text-pretty text-charcoal">{text}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/signup/employer?mode=full" className={buttonStyles({ size: "lg" })}>
          Create a company workspace
        </Link>
        <Link href="/login?as=employer" className={buttonStyles({ variant: "secondary", size: "lg" })}>
          Recruiter sign in
        </Link>
      </div>
    </Section>
  );
}
