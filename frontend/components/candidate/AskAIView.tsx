"use client";

import { BriefcaseBusiness, Building2, CalendarDays, Gift, ListChecks, Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { AskAssistant } from "@/components/candidate/AskAssistant";
import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { CandidateHeader } from "@/components/candidate/CandidateHeader";
import { authLinkStyles } from "@/components/auth/AuthCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ASK_AI_PROMPTS } from "@/lib/ask-ai";

const TOPICS: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: Building2, title: "The company", description: "What it does, its mission and products" },
  { icon: BriefcaseBusiness, title: "Your role", description: "The team, the job and what it involves" },
  { icon: Gift, title: "Culture and benefits", description: "How the team works and what it offers" },
  { icon: CalendarDays, title: "The interview process", description: "The stages, and what to expect" },
  { icon: ListChecks, title: "Your application", description: "Where it stands and what happens next" },
];

/** The full candidate assistant, with what it can help with alongside. */
export function AskAIView() {
  const { me, applicationId } = useCandidatePortal();
  const subtitle = `Ask about ${me.company}, the role, culture, benefits, the interview process or your application.`;

  // The assistant works from an application; without one, the Company page has what candidates can read.
  if (!applicationId) {
    return (
      <>
        <CandidateHeader title="Ask AI" subtitle={subtitle} />
        <EmptyState
          icon={Sparkles}
          title="Ask AI opens once you have an application"
          description={`In the meantime, the Company page has what ${me.company} shares with candidates.`}
          action={
            <Link href="/candidate/company" className={buttonStyles({ variant: "secondary" })}>
              About {me.company}
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <CandidateHeader title="Ask AI" subtitle={subtitle} />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_288px]">
        {/* A conversation is about one application: switching applications starts a new one. */}
        <AskAssistant
          key={applicationId}
          description={`Answers from your application and what ${me.company} shares with candidates`}
          prompts={ASK_AI_PROMPTS}
          threadClassName="max-h-[60vh] min-h-[160px]"
          askShortcut
        />
        <Card className="p-5 sm:p-5">
          <h2 className="text-base font-semibold tracking-tight text-ink">What you can ask about</h2>
          <ul className="mt-3.5 flex flex-col gap-3.5">
            {TOPICS.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] ring-1 ring-ink/10">
                  <Icon aria-hidden className="size-4 text-charcoal" />
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="block text-sm font-medium text-ink">{title}</span>
                  <span className="block text-[13px] text-stone">{description}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-border pt-3.5 text-[13px] text-stone">
            More about {me.company} is on the{" "}
            <Link href="/candidate/company" className={authLinkStyles}>
              Company
            </Link>{" "}
            page.
          </p>
        </Card>
      </div>
    </>
  );
}
