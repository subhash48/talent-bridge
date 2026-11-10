import { Search } from "lucide-react";
import Link from "next/link";

import { JOBS_LINK } from "@/components/site/nav";
import { Section } from "@/components/site/Section";
import { buttonStyles } from "@/components/ui/Button";

// What a candidate finds in the portal, as plain lines.
const FEATURES = [
  "Where each application stands",
  "What happens next, and when",
  "Messages from the hiring team",
  "Interviews you can confirm",
  "Help preparing for each interview",
  "About each company",
  "An assistant for your preparation",
  "Every application in one account",
];

// An example, not real employers or roles: what one account looks like with three applications.
const APPLICATIONS = [
  { company: "Harbor Street Dental", role: "Front desk coordinator", stage: "Interview" },
  { company: "Kestrel Freight", role: "Dispatch planner", stage: "Applied" },
  { company: "Juniper & Rye", role: "Line cook", stage: "Screening" },
];

/** The candidate portal, and the ways in: an account first, or a role on the job board first. */
export function CandidatesSection() {
  return (
    <Section
      level="h1"
      id="candidates"
      eyebrow="For candidates"
      title="Know where every application stands."
      intro="Apply to a role on the Hirvello job board, or create your account first. Either way, everything about your applications is in one portal: where you stand, what happens next, and how to prepare."
    >
      <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[1.3fr_1fr]">
        <ul className="grid grid-cols-1 content-start border-t border-ink/[0.08] sm:grid-cols-2 sm:gap-x-8">
          {FEATURES.map((label) => (
            <li key={label} className="border-b border-ink/[0.08] py-3.5 text-[16px] font-medium text-ink">
              {label}
            </li>
          ))}
        </ul>
        <figure className="reveal sky-card self-start rounded-[20px] p-5">
          <p className="text-[14px] font-semibold text-ink">My applications</p>
          <ul className="mt-3 flex flex-col gap-2">
            {APPLICATIONS.map((application) => (
              <li
                key={application.company}
                className="flex items-center justify-between gap-3 rounded-[14px] bg-overlay px-4 py-3 ring-1 ring-ink/[0.06]"
              >
                <span className="min-w-0 text-sm text-charcoal">
                  <span className="block font-semibold text-ink">{application.company}</span>
                  {application.role}
                </span>
                <span className="shrink-0 rounded-full bg-accent-soft/80 px-2.5 py-0.5 text-xs font-medium text-brand-ink">
                  {application.stage}
                </span>
              </li>
            ))}
          </ul>
          <figcaption className="mt-3 text-[13px] leading-relaxed text-stone">
            An example account. Apply to another company with the same email and it joins the same account.
          </figcaption>
        </figure>
      </div>
      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/signup" className={buttonStyles({ size: "lg" })}>
          Create a candidate account
        </Link>
        <Link href={JOBS_LINK.href} className={buttonStyles({ variant: "secondary", size: "lg" })}>
          <Search aria-hidden className="text-brand-ink" />
          Browse jobs
        </Link>
        <Link href="/login?as=candidate" className={buttonStyles({ variant: "ghost", size: "lg", className: "text-ink" })}>
          Already applied? Sign in
        </Link>
      </div>
    </Section>
  );
}
