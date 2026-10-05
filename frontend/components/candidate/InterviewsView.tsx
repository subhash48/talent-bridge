"use client";

import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { CandidateHeader } from "@/components/candidate/CandidateHeader";
import { InterviewCard } from "@/components/candidate/InterviewCard";
import { LoadError } from "@/components/candidate/LoadError";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList } from "@/components/ui/Tabs";
import { useConfirmInterview } from "@/hooks/useConfirmInterview";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { engagement } from "@/lib/engagement";
import { pluralize } from "@/lib/format";
import { getCandidateInterviews } from "@/services/portal";
import type { CandidateInterview } from "@/types/portal";

type Group = "upcoming" | "completed" | "cancelled";

const EMPTY: Record<Group, { title: string; description: string }> = {
  upcoming: { title: "No upcoming interviews yet.", description: "When your recruiter schedules one, it'll appear here with everything you need." },
  completed: { title: "No completed interviews", description: "Interviews you've had will be listed here." },
  cancelled: { title: "No cancelled interviews", description: "If an interview is cancelled, it'll be listed here." },
};

function groupOf(interview: CandidateInterview): Group {
  if (interview.status === "cancelled") return "cancelled";
  return interview.upcoming ? "upcoming" : "completed";
}

/** The interviews for the application the portal is showing; the server-rendered list is only used
 * when it was rendered for that same application. */
export function CandidateInterviews({ renderedFor, initialInterviews }: { renderedFor: string | null; initialInterviews?: CandidateInterview[] }) {
  const { applicationId } = useCandidatePortal();
  return (
    <InterviewsView
      key={applicationId ?? "none"}
      applicationId={applicationId}
      initialInterviews={renderedFor === applicationId ? initialInterviews : undefined}
    />
  );
}

type InterviewsViewProps = { applicationId: string | null; initialInterviews?: CandidateInterview[] };

function InterviewsView({ applicationId, initialInterviews }: InterviewsViewProps) {
  const { me } = useCandidatePortal();
  const load = useCallback(() => getCandidateInterviews(applicationId), [applicationId]);
  const { data, error, refresh, setData } = useLiveQuery(load, { initialData: initialInterviews });
  const { confirm, pendingId } = useConfirmInterview((confirmed) =>
    setData((list) => list?.map((interview) => (interview.id === confirmed.id ? confirmed : interview))),
  );
  const [tab, setTab] = useState<Group>("upcoming");
  const nextId = data?.find((interview) => groupOf(interview) === "upcoming")?.id;

  // Opening the page shows the next interview's details: that is the one recorded as viewed.
  useEffect(() => {
    if (nextId) engagement.track({ type: "interview_viewed", interviewId: nextId });
  }, [nextId]);

  const upcomingCount = data?.filter((interview) => groupOf(interview) === "upcoming").length ?? 0;
  const header = (
    <CandidateHeader
      title="Interviews"
      subtitle={data ? (upcomingCount ? `${pluralize(upcomingCount, "upcoming interview")}` : "No upcoming interviews") : undefined}
    />
  );

  if (!data) {
    return (
      <>
        {header}
        {error ? (
          <LoadError title="Your interviews couldn't load" message={error} onRetry={() => void refresh()} />
        ) : (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading interviews">
            <Skeleton className="h-9 w-80 max-w-full" />
            <Skeleton className="h-[168px] rounded-[14px]" />
            <Skeleton className="h-[168px] rounded-[14px]" />
          </div>
        )}
      </>
    );
  }

  const groups: Record<Group, CandidateInterview[]> = { upcoming: [], completed: [], cancelled: [] };
  for (const interview of data) groups[groupOf(interview)].push(interview);
  groups.completed.reverse(); // most recent first
  groups.cancelled.reverse();

  return (
    <>
      {header}
      <Tabs value={tab} onValueChange={(value) => setTab(value as Group)}>
        <TabsList
          label="Interviews"
          value={tab}
          tabs={[
            { value: "upcoming", label: `Upcoming (${groups.upcoming.length})` },
            { value: "completed", label: `Completed (${groups.completed.length})` },
            { value: "cancelled", label: `Cancelled (${groups.cancelled.length})` },
          ]}
        />
        {(Object.keys(groups) as Group[]).map((group) => (
          <TabsContent key={group} value={group} className="mt-5 flex flex-col gap-4">
            {groups[group].length > 0 ? (
              groups[group].map((interview) => (
                <InterviewCard
                  key={interview.id}
                  interview={interview}
                  company={me.company}
                  onConfirm={(item) => void confirm(item)}
                  confirming={pendingId === interview.id}
                />
              ))
            ) : (
              <EmptyState icon={CalendarDays} title={EMPTY[group].title} description={EMPTY[group].description} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
