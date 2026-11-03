import { Mail } from "lucide-react";
import Link from "next/link";

import { ContactForm } from "@/components/site/ContactForm";
import { FeatureIcon, Section } from "@/components/site/Section";
import { SIGNUP_LINK } from "@/components/site/nav";

/** What a walkthrough covers: only what the product does today. */
const SHOWN = [
  "How candidates are matched only on criteria about the job that you choose, with the reasons shown and never a score.",
  "The messages, drafts and interview scheduling that keep every candidate informed of where they stand.",
  "Simple Hire, for a business that posts a job by describing it and talks to who applied.",
];

/**
 * Book a demo: a request, not a calendar. There's no scheduling service behind the site, so this is the contact form
 * set to the pilot programme, with no inquiry type to pick: the request is kept with the other messages
 * (contact_requests), emailed to the team when an address is configured, and answered by email with times.
 * Nothing here promises a slot it can't keep.
 */
export function DemoSection({ email }: { email: string | null }) {
  return (
    <Section
      level="h1"
      id="demo"
      eyebrow="Book a demo"
      title="See Hirvello with your own roles."
      intro="Tell us about your team and what you're hiring for. We'll reply by email to set up a walkthrough of the recruiter workspace, Simple Hire and the candidate portal, with sample data or your own open roles."
    >
      <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.6fr]">
        <div className="flex max-w-[26rem] flex-col gap-7 text-[15px] leading-relaxed text-charcoal">
          <div>
            <p className="text-[12px] font-semibold tracking-[0.18em] text-brand-ink/80 uppercase">What you&rsquo;ll see</p>
            <ul className="mt-3 flex flex-col gap-3">
              {SHOWN.map((line) => (
                <li key={line} className="flex gap-3">
                  <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="text-pretty">{line}</span>
                </li>
              ))}
            </ul>
          </div>
          {email && (
            <p className="flex items-center gap-3">
              <FeatureIcon>
                <Mail aria-hidden strokeWidth={1.75} />
              </FeatureIcon>
              <span>
                Or email{" "}
                <a href={`mailto:${email}`} className="font-medium text-brand-ink underline-offset-4 hover:underline">
                  {email}
                </a>
              </span>
            </p>
          )}
          <p className="text-[14px] text-stone">
            Prefer to look around first? Every workspace is free while we&rsquo;re in beta:{" "}
            <Link href={SIGNUP_LINK.href} className="font-medium text-brand-ink underline-offset-4 hover:underline">
              create one
            </Link>{" "}
            and explore with sample data.
          </p>
        </div>
        <div className="sky-card self-start rounded-[20px] p-5 sm:p-7">
          <ContactForm topic="pilot" topicChoice={false} messageLabel="What would you like to see?" submitLabel="Request a demo" />
        </div>
      </div>
    </Section>
  );
}
