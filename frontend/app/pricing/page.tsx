import { ArrowRight, Check, type LucideIcon } from "lucide-react";
import { Store, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Section } from "@/components/site/Section";
import { SitePage } from "@/components/site/SitePage";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Hirvello is free while it's in beta. Every workspace, every feature, sample data included.",
};

// The three ways in, and what each includes. No prices: there are none yet, and the page says so rather than
// inventing them.
const PLANS: { icon: LucideIcon; name: string; who: string; href: string; action: string; includes: string[]; featured?: boolean }[] = [
  {
    icon: Store,
    name: "Simple Hire",
    who: "For shops, restaurants and other small employers.",
    href: "/signup/employer?mode=simple",
    action: "Start Simple Hire",
    includes: ["Post a job by describing it, typed or spoken", "See applicants, with the reasons they match", "Message candidates and ask to interview", "Your own careers page"],
  },
  {
    icon: Users,
    name: "Recruiter workspace",
    who: "For recruiting teams and growing companies.",
    href: "/signup/employer?mode=full",
    action: "Create a workspace",
    featured: true,
    includes: [
      "Everything in Simple Hire",
      "Pipeline, stages and shared filters",
      "Communication gaps noticed, updates drafted",
      "Interviews, reminders and the AI assistant",
      "Analytics and communication rules",
    ],
  },
  {
    icon: UserRound,
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
        intro="Every workspace, every feature, sample data to explore with and no commitment. When pricing comes, everyone in the beta hears about it first, and nothing you've set up changes."
      >
        <ul className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {PLANS.map(({ icon: Icon, name, who, href, action, includes, featured }) => (
            <li
              key={name}
              className={cn(
                "sky-card flex flex-col rounded-[26px] p-7",
                featured && "bg-glass-strong ring-1 ring-accent/25 lg:-my-3 lg:py-10",
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-[12px] bg-accent-soft text-brand-ink ring-1 ring-accent/10">
                <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
              </span>
              <h2 className="mt-6 text-[22px] leading-snug font-semibold tracking-[-0.02em] text-ink">{name}</h2>
              <p className="mt-1 text-[14px] text-stone">{who}</p>
              <p className="mt-6 flex items-baseline gap-2">
                <span className="text-[34px] leading-none font-medium tracking-[-0.04em] text-ink">Free</span>
                <span className="text-[13px] text-stone">during the beta</span>
              </p>
              <ul className="mt-6 flex flex-col gap-2.5 text-[14px] leading-snug text-charcoal">
                {includes.map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-ink" strokeWidth={2.25} />
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href={href}
                className={buttonStyles({ variant: featured ? "primary" : "secondary", size: "lg", className: "group mt-8 w-full" })}
              >
                {action}
                <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-[14px] text-stone">
          Need something else, such as more than one workspace or a conversation about your team?{" "}
          <Link href="/contact" className="font-medium text-brand-ink underline-offset-4 hover:underline">
            Talk to us
          </Link>
          .
        </p>
      </Section>
    </SitePage>
  );
}
