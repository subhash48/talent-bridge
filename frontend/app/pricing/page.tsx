import { ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Section } from "@/components/site/Section";
import { SitePage } from "@/components/site/SitePage";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Hirvello costs nothing while it's in beta: every workspace and every feature, with sample data to try things on.",
};

// The three ways in, and what each includes. No prices: there are none yet, and the page says so rather than
// inventing them.
const PLANS: { name: string; who: string; href: string; action: string; includes: string[]; featured?: boolean }[] = [
  {
    name: "Simple Hire",
    who: "For shops, restaurants and other small employers.",
    href: "/signup/employer?mode=simple",
    action: "Start Simple Hire",
    includes: [
      "Post a job by describing it, typed or spoken",
      "See applicants, with the reasons they match",
      "Message candidates and ask to interview",
      "Your jobs on the Hirvello job board",
    ],
  },
  {
    name: "Recruiter workspace",
    who: "For recruiting teams and growing companies.",
    href: "/signup/employer?mode=full",
    action: "Create a workspace",
    featured: true,
    includes: [
      "Everything in Simple Hire",
      "Pipeline, stages and shared filters",
      "See who's waiting, with the update drafted",
      "Interviews, reminders and the AI assistant",
      "Analytics and communication rules",
    ],
  },
  {
    name: "Candidates",
    who: "For anyone applying.",
    href: "/signup",
    action: "Create a candidate account",
    includes: ["Every application in one portal", "Messages from each hiring team", "Interviews, with confirmation", "Interview preparation"],
  },
];

/** Pricing: free during the beta, and what each way in includes. */
export default function PricingPage() {
  return (
    <SitePage>
      <Section
        level="h1"
        id="pricing"
        eyebrow="Pricing"
        title="Free while we're in beta."
        intro="There's nothing to pay during the beta: every workspace and every feature, with sample data to try things on. When pricing arrives, people in the beta hear about it first, and nothing you've set up changes."
      >
        <ul className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {PLANS.map(({ name, who, href, action, includes, featured }) => (
            <li
              key={name}
              className={cn(
                "sky-card flex flex-col rounded-[20px] p-6",
                featured && "bg-glass-strong ring-1 ring-accent/25 lg:-my-3 lg:py-9",
              )}
            >
              <h2 className="text-[1.25rem] leading-snug font-semibold tracking-[-0.015em] text-ink">{name}</h2>
              <p className="mt-1 text-[0.875rem] text-stone">{who}</p>
              <p className="mt-5 flex items-baseline gap-2">
                <span className="text-[1.875rem] leading-none font-bold tracking-[-0.03em] text-ink">Free</span>
                <span className="text-[13px] text-stone">during the beta</span>
              </p>
              <ul className="mt-5 flex flex-col gap-2.5 text-[0.875rem] leading-snug text-charcoal">
                {includes.map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-ink" strokeWidth={2.25} />
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href={href}
                className={buttonStyles({ variant: featured ? "primary" : "secondary", size: "lg", className: "group mt-6 w-full" })}
              >
                {action}
                <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-[0.875rem] text-stone">
          Need something else, such as more than one workspace or a conversation about your team?{" "}
          <Link href="/contact" className="font-medium text-brand-ink underline-offset-4 hover:underline">
            Write to us
          </Link>
          .
        </p>
      </Section>
    </SitePage>
  );
}
