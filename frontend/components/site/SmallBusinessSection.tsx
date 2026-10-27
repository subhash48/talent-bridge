import { CalendarPlus, Megaphone, MessageCircle, Mic, Users } from "lucide-react";
import Link from "next/link";

import { Section } from "@/components/site/Section";
import { buttonStyles } from "@/components/ui/Button";

const ACTIONS = [
  { icon: Megaphone, label: "Post a job" },
  { icon: Users, label: "See applicants" },
  { icon: MessageCircle, label: "Contact candidates" },
  { icon: CalendarPlus, label: "Schedule interview" },
];

const FACTS = ["$18/hour", "Evening shift", "Friday + Saturday", "2 openings"];

/** Simple Hire: for shops, restaurants and other small employers who just want to post jobs and contact applicants. */
export function SmallBusinessSection() {
  return (
    <Section
      level="h1"
      id="small-business"
      eyebrow="For small businesses"
      title="Hiring shouldn't require learning recruiting software."
      intro={
        <>
          Simple Hire is Kavuntra for local shops, restaurants, cafes, warehouses and other small employers. Say
          what you need, typed or out loud. Kavuntra prepares it, and nothing is posted or sent until you&apos;ve
          seen it and said yes.
        </>
      }
    >
      <div className="mt-16 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.1fr]">
        <ul className="grid grid-cols-2 gap-3 self-start">
          {ACTIONS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="reveal sky-card flex min-h-[112px] flex-col justify-between rounded-[20px] p-5"
            >
              <Icon aria-hidden strokeWidth={1.75} className="size-5 text-brand-ink" />
              <span className="text-[15px] font-semibold text-ink">{label}</span>
            </li>
          ))}
        </ul>
        <figure className="reveal sky-card rounded-[24px] p-5 sm:p-7" aria-label="An example">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand">
              <Mic aria-hidden className="size-4" />
            </span>
            <blockquote className="rounded-[18px] rounded-tl-[6px] bg-overlay px-4 py-3 text-[15px] leading-relaxed text-charcoal ring-1 ring-ink/[0.06]">
              &ldquo;I need two workers for my restaurant. Evening shift, $18 an hour. They should have kitchen
              experience and be available Friday and Saturday.&rdquo;
            </blockquote>
          </div>
          <div className="mt-5 rounded-[18px] bg-overlay p-5 ring-1 ring-ink/[0.06]">
            <p className="text-[13px] font-semibold text-brand-ink">Ready to post</p>
            <p className="mt-1 text-lg font-semibold text-ink">Kitchen Assistant</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {FACTS.map((fact) => (
                <li key={fact} className="rounded-full bg-muted px-3 py-1 text-[13px] font-medium text-charcoal">
                  {fact}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2" aria-hidden>
              <span className={buttonStyles({ size: "md", className: "pointer-events-none" })}>Post Job</span>
              <span className={buttonStyles({ variant: "secondary", size: "md", className: "pointer-events-none" })}>
                Edit
              </span>
            </div>
          </div>
          <figcaption className="mt-4 text-[13px] leading-relaxed text-stone">
            Then: &ldquo;Show me 3 applicants with kitchen experience who are available Friday and Saturday.&rdquo; Each
            one comes with the reasons they match, and you choose whom to contact.
          </figcaption>
        </figure>
      </div>
      <div className="mt-16 flex flex-wrap gap-3">
        <Link href="/signup/employer?mode=simple" className={buttonStyles({ size: "xl" })}>
          Simple Hire
        </Link>
        <Link href="/login?as=employer" className={buttonStyles({ variant: "ghost", size: "xl" })}>
          Already using Simple Hire? Sign in
        </Link>
      </div>
    </Section>
  );
}
