import { Mic } from "lucide-react";
import Link from "next/link";

import { Section } from "@/components/site/Section";
import { buttonStyles } from "@/components/ui/Button";

// What a small business does with Simple Hire, in the order it happens.
const ACTIONS = [
  { label: "Post a job", text: "Describe the job the way you'd tell a friend. Simple Hire writes it up for you to check." },
  { label: "See who applied", text: "Each applicant comes with the reasons they fit what you asked for." },
  { label: "Contact the ones you like", text: "Send a message from Hirvello. You read it before it goes." },
  { label: "Set up an interview", text: "Pick a time that suits you and invite the candidate." },
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
          Simple Hire is Hirvello for local shops, restaurants, cafes, warehouses and other small employers. Say
          what you need, typed or out loud. Hirvello prepares it, and nothing is posted or sent until you&apos;ve
          seen it and said yes.
        </>
      }
    >
      <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.1fr]">
        <ol className="self-start border-t border-ink/[0.08]">
          {ACTIONS.map(({ label, text }, index) => (
            <li key={label} className="reveal grid grid-cols-[2rem_1fr] border-b border-ink/[0.08] py-5">
              <span aria-hidden className="pt-0.5 text-[15px] font-semibold text-accent tabular-nums">
                0{index + 1}
              </span>
              <div>
                <p className="text-[18px] font-semibold tracking-[-0.01em] text-ink">{label}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-pretty text-charcoal">{text}</p>
              </div>
            </li>
          ))}
        </ol>
        <figure className="reveal sky-card rounded-[20px] p-5 sm:p-6" aria-label="An example">
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
            <p className="mt-1 text-lg font-semibold text-ink">Kitchen assistant</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {FACTS.map((fact) => (
                <li key={fact} className="rounded-full bg-muted px-3 py-1 text-[13px] font-medium text-charcoal">
                  {fact}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2" aria-hidden>
              <span className={buttonStyles({ size: "md", className: "pointer-events-none" })}>Post job</span>
              <span className={buttonStyles({ variant: "secondary", size: "md", className: "pointer-events-none" })}>
                Edit
              </span>
            </div>
          </div>
          <figcaption className="mt-4 text-[13px] leading-relaxed text-pretty text-stone">
            Then: &ldquo;Show me 3 applicants with kitchen experience who are available Friday and Saturday.&rdquo; Each
            one comes with the reasons they match, and you choose whom to contact.
          </figcaption>
        </figure>
      </div>
      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/signup/employer?mode=simple" className={buttonStyles({ size: "lg" })}>
          Start Simple Hire
        </Link>
        <Link href="/login?as=employer" className={buttonStyles({ variant: "ghost", size: "lg" })}>
          Already using Simple Hire? Sign in
        </Link>
      </div>
    </Section>
  );
}
