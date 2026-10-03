import { CalendarDays, ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";

import { InterviewRow } from "@/components/recruiter/InterviewRow";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatDayLabel, pluralize } from "@/lib/format";
import { getInterviews } from "@/services/interviews";
import type { ScheduledInterview } from "@/types/workspace";

export const metadata: Metadata = { title: "Interviews" };

function partition(interviews: ScheduledInterview[], now = Date.now()) {
  const upcoming = interviews.filter((interview) => new Date(interview.scheduledAt).getTime() > now);
  const past = interviews.filter((interview) => new Date(interview.scheduledAt).getTime() <= now).reverse();
  return {
    upcoming,
    needsFeedback: past.filter((interview) => interview.feedback === "pending"),
    completed: past.filter((interview) => interview.feedback !== "pending"),
  };
}

function groupByDay(interviews: ScheduledInterview[]): [string, ScheduledInterview[]][] {
  const groups = new Map<string, ScheduledInterview[]>();
  for (const interview of interviews) {
    const label = formatDayLabel(interview.scheduledAt, { long: true });
    groups.set(label, [...(groups.get(label) ?? []), interview]);
  }
  return [...groups];
}

export default async function InterviewsPage() {
  const { upcoming, needsFeedback, completed } = partition(await getInterviews());
  const awaiting = upcoming.filter((interview) => interview.status === "scheduled" || interview.status === "reschedule_requested");

  return (
    <div>
      <RecruiterHeader
        title="Interviews"
        subtitle={`${pluralize(upcoming.length, "upcoming interview")} · ${awaiting.length} awaiting confirmation · ${needsFeedback.length} need feedback`}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="upcoming-heading" className="glass @container rounded-[22px] border border-border p-2 sm:p-3">
          <h2 id="upcoming-heading" className="px-3 pt-3 text-lg font-semibold tracking-tight text-ink">
            Upcoming
          </h2>
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nothing scheduled" description="New interviews appear here as they're booked." className="m-3" />
          ) : (
            groupByDay(upcoming).map(([day, items]) => (
              <div key={day}>
                <h3 className="px-3 pt-5 pb-1.5 text-[13px] font-medium text-stone">{day}</h3>
                <ul className="flex flex-col">
                  {items.map((interview) => (
                    <InterviewRow key={interview.id} interview={interview} />
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="feedback-heading" className="glass @container rounded-[22px] border border-border p-2 sm:p-3">
            <h2 id="feedback-heading" className="flex items-center justify-between px-3 pt-3 text-lg font-semibold tracking-tight text-ink">
              Needs feedback
              {needsFeedback.length > 0 && (
                <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-200 ring-1 ring-amber-300/20">
                  {needsFeedback.length}
                </span>
              )}
            </h2>
            {needsFeedback.length === 0 ? (
              <p className="px-3 pt-2 pb-3 text-sm text-stone">All feedback is in. Nice work.</p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {needsFeedback.map((interview) => (
                  <InterviewRow key={interview.id} interview={interview} past />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="completed-heading" className="glass @container rounded-[22px] border border-border p-2 sm:p-3">
            <h2 id="completed-heading" className="px-3 pt-3 text-lg font-semibold tracking-tight text-ink">
              Recently completed
            </h2>
            {completed.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="No completed interviews" className="m-3 py-8" />
            ) : (
              <ul className="mt-2 flex flex-col">
                {completed.map((interview) => (
                  <InterviewRow key={interview.id} interview={interview} past />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
