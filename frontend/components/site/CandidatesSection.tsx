import {
  Building2,
  CalendarCheck2,
  CircleDot,
  Layers,
  ListChecks,
  MessagesSquare,
  NotebookPen,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { FeatureIcon, Section } from "@/components/site/Section";
import { buttonStyles } from "@/components/ui/Button";

const FEATURES = [
  { icon: CircleDot, label: "Application status" },
  { icon: ListChecks, label: "Next steps" },
  { icon: MessagesSquare, label: "Messages from the hiring team" },
  { icon: CalendarCheck2, label: "Interviews" },
  { icon: NotebookPen, label: "Interview preparation" },
  { icon: Building2, label: "Company information" },
  { icon: Sparkles, label: "An AI preparation assistant" },
  { icon: Layers, label: "Every application in one account" },
];

// Placeholders, not real employers: what one account looks like with three applications.
const APPLICATIONS = [
  { company: "Company A", role: "Role A", stage: "Interview" },
  { company: "Company B", role: "Role B", stage: "Applied" },
  { company: "Company C", role: "Role C", stage: "Screening" },
];

/** The candidate portal, and the two ways in: an account first, or applying first. */
export function CandidatesSection() {
  return (
    <Section
      level="h1"
      id="candidates"
      eyebrow="For candidates"
      title="One place for your hiring journey."
      intro="Apply to a role on a Kavuntra careers page, or create your account first. Either way, everything about your applications is in one portal: where you stand, what happens next, and how to prepare."
    >
      <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-[1.3fr_1fr]">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3">
              <FeatureIcon>
                <Icon aria-hidden strokeWidth={1.75} />
              </FeatureIcon>
              <span className="text-[15px] font-medium text-ink">{label}</span>
            </li>
          ))}
        </ul>
        <div className="reveal sky-card self-start rounded-[24px] p-6" aria-label="An example account">
          <p className="text-[13px] font-semibold text-ink">My Applications</p>
          <ul className="mt-3 flex flex-col gap-2">
            {APPLICATIONS.map((application) => (
              <li
                key={application.company}
                className="flex items-center justify-between gap-3 rounded-[14px] bg-overlay px-4 py-3 ring-1 ring-ink/[0.06]"
              >
                <span className="text-sm text-charcoal">
                  <span className="font-semibold text-ink">{application.company}</span> — {application.role}
                </span>
                <span className="rounded-full bg-accent-soft/80 px-2.5 py-0.5 text-xs font-medium text-brand-ink">
                  {application.stage}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] leading-relaxed text-stone">
            Apply to another company with the same email and it joins the same account.
          </p>
        </div>
      </div>
      <div className="mt-16 flex flex-wrap gap-3">
        <Link href="/signup" className={buttonStyles({ size: "xl" })}>
          Create candidate account
        </Link>
        <Link href="/login?as=candidate" className={buttonStyles({ variant: "secondary", size: "xl" })}>
          Already applied? Sign in
        </Link>
      </div>
    </Section>
  );
}
