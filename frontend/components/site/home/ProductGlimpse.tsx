import { ArrowRight, CalendarClock, ListChecks, MessageSquareText, NotebookPen, Radar, Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { HomeSection } from "@/components/site/home/HomeSection";
import { buttonStyles } from "@/components/ui/Button";

// What the product does, in the order it happens to a hire.
const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Radar, title: "Communication gaps, noticed", text: "A stage change nobody mentioned, a question with no reply, an interview with no follow-up: Today shows who's waiting." },
  { icon: MessageSquareText, title: "Updates, drafted", text: "One message each, written from the candidate's own application. You review it; nothing is sent until you approve." },
  { icon: Sparkles, title: "An assistant that does the work", text: "Ask in your own words, typed or spoken. It drafts jobs, finds matches and proposes times, with the reasons shown." },
  { icon: ListChecks, title: "Every application, followed", text: "Candidates see where each application stands, what comes next, their messages and their interviews, in one portal." },
  { icon: NotebookPen, title: "Interview prep, built in", text: "Before an interview, the portal helps the candidate prepare for that role and that stage." },
  { icon: CalendarClock, title: "Interviews, booked", text: "Propose times, book interviews and remind candidates to confirm, without leaving the conversation." },
];

// A still of the recruiter's Today: who needs an update, with a draft ready. Decorative, so it's hidden from screen readers.
const TODAY = [
  { name: "Priya Nair", role: "Product designer", reason: "Interviewed Tuesday, no follow-up", draft: true },
  { name: "Marcus Lee", role: "Account executive", reason: "Asked about the start date, no reply", draft: true },
  { name: "Sofia Alvarez", role: "Office coordinator", reason: "Interview Thursday, not confirmed", draft: false },
];

/** The product, glimpsed: a still of Today beside what Hirvello does, feature by feature. */
export function ProductGlimpse() {
  return (
    <HomeSection id="product" eyebrow="The product" title="A hiring system that keeps its word." intro="Everything Hirvello does is in service of one promise: nobody in your hiring process is left guessing.">
      <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_1fr] lg:gap-8">
        <figure aria-hidden className="reveal sky-card rounded-[28px] p-3 sm:p-4">
          <div className="rounded-[20px] bg-glass-strong p-5 ring-1 ring-ink/[0.05] sm:p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[22px] font-semibold tracking-[-0.03em] text-ink">Today</p>
                <p className="mt-1 text-[13px] text-stone">3 candidates need an update from you</p>
              </div>
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-medium text-brand-ink">2 drafts ready</span>
            </div>
            <ul className="mt-5 flex flex-col gap-2.5">
              {TODAY.map((row) => (
                <li key={row.name} className="flex items-center gap-3 rounded-[16px] bg-overlay/80 p-3.5 ring-1 ring-ink/[0.05]">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-brand-ink">
                    {row.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-[14px] font-medium text-ink">{row.name}</span>
                      <span className="truncate text-[12px] text-stone">{row.role}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-caution">{row.reason}</span>
                  </span>
                  <span
                    className={
                      row.draft
                        ? "hidden shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[11.5px] font-medium text-brand-ink sm:inline"
                        : "hidden shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-medium text-charcoal sm:inline"
                    }
                  >
                    {row.draft ? "Review draft" : "Remind"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </figure>

        <ul className="grid grid-cols-1 gap-x-8 gap-y-7 self-center sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="reveal flex gap-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-accent-soft text-brand-ink ring-1 ring-accent/10">
                <Icon aria-hidden className="size-4" strokeWidth={1.75} />
              </span>
              <div>
                <h3 className="text-[15px] leading-snug font-semibold text-ink">{title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-charcoal">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-12 flex justify-center">
        <Link href="/product" className={buttonStyles({ variant: "glass", size: "xl", className: "group" })}>
          See the whole product
          <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </HomeSection>
  );
}
