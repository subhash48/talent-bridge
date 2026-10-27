import { ListChecks, MessageSquareText, NotebookPen, Radar, Store, type LucideIcon } from "lucide-react";

import { FeatureIcon, Section } from "@/components/site/Section";

// What Kavuntra does, in the order it happens to a hire: the gap is noticed, the update drafted, the candidate kept
// in the picture and prepared; and Simple Hire, the whole of it for a small business.
const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Radar,
    title: "Communication-gap detection",
    text: "Today shows a recruiter who is waiting on them: a stage change nobody mentioned, a question with no reply, a candidate who has heard nothing for longer than your team allows.",
  },
  {
    icon: MessageSquareText,
    title: "Personalized recruiter updates",
    text: "For the people a recruiter picks, one message each, drafted from that candidate's own application. The recruiter reviews it; nothing is sent until they approve.",
  },
  {
    icon: ListChecks,
    title: "Candidate application tracking",
    text: "Candidates follow every application in one portal: where it stands, what comes next, their messages and their interviews.",
  },
  {
    icon: NotebookPen,
    title: "AI interview preparation",
    text: "Before an interview, the portal helps the candidate prepare for that role and that stage, so they arrive ready rather than guessing.",
  },
  {
    icon: Store,
    title: "Simple Hire for small businesses",
    text: "Say who you need, typed or out loud, and Simple Hire turns it into a job that's ready to post. Nothing is posted or sent until you've seen it and said yes.",
  },
];

/** The product, concisely: what Kavuntra does, feature by feature. */
export function ProductSection() {
  return (
    <Section
      level="h1"
      id="product"
      eyebrow="Product"
      title="One hiring experience. Two sides."
      intro="Kavuntra works on the communication layer of hiring: it notices when a conversation has gone quiet, drafts the next update for a recruiter to review, and shows each candidate where they stand and what happens next."
    >
      <ul className="mt-14 grid grid-cols-1 gap-x-10 gap-y-9 md:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-4">
            <FeatureIcon>
              <Icon aria-hidden strokeWidth={1.75} />
            </FeatureIcon>
            <div>
              <h2 className="text-[18px] leading-snug font-semibold tracking-[-0.01em] text-ink">{title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-charcoal">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
