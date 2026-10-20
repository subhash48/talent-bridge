"use client";

import { CalendarClock, CircleCheck, MessageCircleQuestion, MoveRight, Sparkles, TimerReset, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { useState, type ComponentType } from "react";

import { DraftPanel } from "@/components/recruiter/communication/DraftPanel";
import { EmailNotice } from "@/components/recruiter/communication/EmailNotice";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Avatar } from "@/components/shared/Avatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { firstName, formatRelativeTime, formatSchedule, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getAttention } from "@/services/communication";
import type { AttentionItem, AttentionList, AttentionReason, CommunicationRule } from "@/types/communication";

type Section = { rule: CommunicationRule; title: string; hint: string; icon: ComponentType<{ className?: string }> };

// In the order the rules are checked: each candidate appears once, under their most pressing reason.
const SECTIONS: Section[] = [
  { rule: "stage_update", title: "Status changed, not told yet", hint: "Their stage moved and nobody has told them.", icon: MoveRight },
  {
    rule: "unanswered_question",
    title: "Waiting for your reply",
    hint: "They wrote to you and haven't heard back.",
    icon: MessageCircleQuestion,
  },
  {
    rule: "post_interview",
    title: "Interviewed, no follow-up",
    hint: "Their interview ended and they haven't heard from you since.",
    icon: UserRoundCheck,
  },
  {
    rule: "interview_unconfirmed",
    title: "Interviews to confirm",
    hint: "Coming up soon and not confirmed. A reminder clears it.",
    icon: CalendarClock,
  },
  {
    rule: "no_recent_update",
    title: "No update in a while",
    hint: "Active candidates who haven't heard from you, with no interview booked.",
    icon: TimerReset,
  },
];

type TodayViewProps = { initial: AttentionList | null; error?: string };

/** The recruiter's home: who needs an update today, and the draft → edit → approve → send to give it. */
export function TodayView({ initial, error }: TodayViewProps) {
  const toast = useToast();
  const { refresh, emailConfigured } = useWorkspace();
  const [list, setList] = useState<AttentionList | null>(initial);
  const [open, setOpen] = useState<string>();

  // Candidates write from the portal and time passes: catch up when the recruiter comes back.
  useRefetchOnFocus(() => {
    if (open) return; // never pull a draft out from under the recruiter
    getAttention().then(setList, () => undefined);
  });

  if (!list) {
    return (
      <div>
        <RecruiterHeader title="Today" />
        <EmptyState title="Couldn't load who needs an update" description={error} />
      </div>
    );
  }

  const count = list.items.length;
  const subtitle = count
    ? `${pluralize(count, "candidate")} need${count === 1 ? "s" : ""} an update from you`
    : "Every candidate has heard from you on time";

  function sent(item: AttentionItem) {
    setOpen(undefined);
    toast({ title: `Update sent to ${item.name}`, tone: "success" });
    getAttention().then(setList, () => undefined);
    refresh().catch(() => undefined);
  }

  return (
    <div>
      <RecruiterHeader
        title="Today"
        subtitle={subtitle}
        actions={
          list.upcoming > 0 ? (
            <span className="text-[13px] text-stone">{pluralize(list.upcoming, "more candidate")} due within a day</span>
          ) : undefined
        }
      />
      {!emailConfigured && <EmailNotice className="mb-5" />}

      {count === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nobody is waiting on you"
          description="When a candidate is owed an update (a stage change, a reply, an interview follow-up), they'll show up here with a draft ready to review."
          action={
            <Link href="/recruiter/candidates" className="text-sm text-brand-ink underline underline-offset-2 hover:text-ink">
              Go to candidates
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-7">
          {SECTIONS.map((section) => {
            const items = list.items.filter((item) => item.reasons[0]?.rule === section.rule);
            if (items.length === 0) return null;
            const Icon = section.icon;
            return (
              <section key={section.rule} aria-labelledby={`today-${section.rule}`}>
                <div className="mb-2.5 flex items-baseline gap-2.5">
                  <h2 id={`today-${section.rule}`} className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                    <Icon className="size-4 text-caution" />
                    {section.title}
                    <span className="text-sm font-normal text-stone">{items.length}</span>
                  </h2>
                  <p className="hidden text-[13px] text-stone sm:block">{section.hint}</p>
                </div>
                <ul className="flex flex-col gap-2">
                  {items.map((item) => (
                    <AttentionRow
                      key={item.applicationId}
                      item={item}
                      open={open === item.applicationId}
                      onToggle={() => setOpen((current) => (current === item.applicationId ? undefined : item.applicationId))}
                      emailConfigured={emailConfigured}
                      onSent={() => sent(item)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

type AttentionRowProps = {
  item: AttentionItem;
  open: boolean;
  onToggle: () => void;
  emailConfigured: boolean;
  onSent: () => void;
};

function AttentionRow({ item, open, onToggle, emailConfigured, onSent }: AttentionRowProps) {
  const [primary, ...others] = item.reasons;
  const first = firstName(item.name);
  return (
    <li className={cn("glass rounded-[14px] border border-border p-3.5 transition-colors", open && "border-border-strong")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar name={item.name} src={item.avatarUrl} size={40} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <Link
                href={`/recruiter/candidates?candidate=${item.applicationId}`}
                className="truncate text-[15px] font-medium text-ink hover:underline"
              >
                {item.name}
              </Link>
              <span className="truncate text-[13px] text-stone">{item.role}</span>
            </p>
            {primary && <ReasonLine reason={primary} />}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone">
              <span>
                They see: <span className="text-charcoal">{item.candidateStatus}</span>
              </span>
              <span suppressHydrationWarning>
                {item.lastUpdateAt ? `Last update ${formatRelativeTime(item.lastUpdateAt)}` : "No update since they applied"}
              </span>
              {others.map((reason) => (
                <span key={reason.rule} className="rounded-full bg-ink/[0.05] px-2 py-0.5 ring-1 ring-ink/10">
                  {reason.title}
                </span>
              ))}
            </p>
          </div>
        </div>
        <Button
          variant={open ? "secondary" : "ai"}
          size="sm"
          onClick={onToggle}
          aria-expanded={open}
          className="self-start sm:mt-0.5"
        >
          <Sparkles /> {open ? "Close" : item.draft ? "Review draft" : "Draft update"}
        </Button>
      </div>
      {open && (
        <DraftPanel
          className="mt-3.5"
          applicationId={item.applicationId}
          firstName={first}
          reason={primary?.rule}
          initialDraft={item.draft}
          emailConfigured={emailConfigured}
          onSent={() => window.setTimeout(onSent, 1200)}
          onClose={onToggle}
        />
      )}
    </li>
  );
}

function ReasonLine({ reason }: { reason: AttentionReason }) {
  const when =
    reason.rule === "interview_unconfirmed"
      ? formatSchedule(reason.since)
      : formatRelativeTime(reason.since);
  const detail = reason.rule === "unanswered_question" ? `“${reason.detail}”` : reason.detail;
  return (
    <p className="mt-1 text-sm text-charcoal">
      <span className="text-caution">{detail}</span>
      <span className="text-stone" suppressHydrationWarning>
        {" "}
        · {when}
      </span>
    </p>
  );
}
