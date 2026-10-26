import {
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  Gauge,
  HeartPulse,
  KanbanSquare,
  Sparkles,
  Timer,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";

import { FeatureIcon, Section } from "@/components/site/Section";
import { buttonStyles } from "@/components/ui/Button";

const FEATURES = [
  {
    icon: KanbanSquare,
    title: "Candidate pipeline",
    text: "Every application by job and stage, with filters you can share.",
  },
  {
    icon: HeartPulse,
    title: "Communication health",
    text: "Today shows who's waiting on you: a stage change nobody mentioned, a question with no reply.",
  },
  {
    icon: Sparkles,
    title: "AI assistant",
    text: "Ask in your own words, typed or spoken. It drafts and finds; nothing happens until you approve.",
  },
  { icon: BriefcaseBusiness, title: "Jobs", text: "Draft a job with AI, review it, and open it on your careers page." },
  {
    icon: CalendarClock,
    title: "Interviews",
    text: "Propose times, book interviews and remind candidates to confirm.",
  },
  {
    icon: UserRoundCheck,
    title: "Personalized outreach",
    text: "One message each, from each candidate's own application, for the people you picked.",
  },
  {
    icon: Gauge,
    title: "Candidate portal",
    text: "Candidates follow their application, messages, interviews and preparation in one place.",
  },
  { icon: Timer, title: "Communication SLA", text: "Set how long a candidate may wait, rule by rule, for your team." },
  {
    icon: BarChart3,
    title: "Analytics",
    text: "Time between updates, unanswered messages and SLA compliance, across your pipeline.",
  },
];

/** The full recruiting workspace, for recruiting teams and growing companies. */
export function RecruitersSection() {
  return (
    <Section
      id="recruiters"
      eyebrow="For recruiters"
      title="A workspace that keeps every candidate informed."
      intro="For recruiting teams and growing companies: your pipeline, with the communication around it, so no candidate is left waiting without a word. Matching uses only job-related criteria you choose, with the reasons shown, and never a score."
    >
      <ul className="mt-10 grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3.5">
            <FeatureIcon>
              <Icon aria-hidden strokeWidth={1.75} />
            </FeatureIcon>
            <div>
              <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone">{text}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/login?as=employer" className={buttonStyles({ size: "lg" })}>
          Recruiter sign in
        </Link>
        <Link href="/signup/employer?mode=full" className={buttonStyles({ variant: "secondary", size: "lg" })}>
          Create company workspace
        </Link>
      </div>
    </Section>
  );
}
