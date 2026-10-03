import { STAGE_LABELS } from "@/types/application";
import type { MetricKey } from "@/types/workspace";
import {
  PIPELINE_STAGES,
  type CandidateActivity,
  type ActivityKind,
  type Conversation,
  type CurrentUser,
  type JobOpening,
  type PipelineCandidate,
  type ScheduledInterview,
} from "@/types/workspace";

import {
  CANDIDATE_SEEDS,
  CONVERSATION_SEEDS,
  INTERVIEW_SEEDS,
  JOB_SEEDS,
  SEED_TRENDS,
  SEED_USER,
  type CandidateSeed,
} from "./data";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export type MockDb = {
  user: CurrentUser;
  trends: Record<MetricKey, number>;
  candidates: PipelineCandidate[];
  archived: PipelineCandidate[];
  activities: CandidateActivity[];
  interviews: ScheduledInterview[];
  conversations: Conversation[];
  jobs: JobOpening[];
};

let browserDb: MockDb | undefined;

/**
 * The server builds a fresh database per call, so timestamps are always relative to the request.
 * The browser keeps one instance for the session, so mutations (add, move, archive, send) stick.
 */
export function getMockDb(): MockDb {
  if (typeof window === "undefined") return createMockDb(Date.now());
  browserDb ??= createMockDb(Date.now());
  return browserDb;
}

/** Simulated network latency for interactive calls. Skipped on the server to keep SSR fast. */
export function mockDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function createMockDb(now: number): MockDb {
  const ago = (minutes: number) => new Date(now - minutes * MINUTE).toISOString();
  const onDay = (inDays: number, at: string) => {
    const [hours, minutes] = at.split(":").map(Number);
    const date = new Date(now);
    date.setDate(date.getDate() + inDays);
    date.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    return date.toISOString();
  };

  const refs = new Map(CANDIDATE_SEEDS.map((seed) => [seed.id, { id: seed.id, name: seed.name, role: seed.role }]));

  const interviews: ScheduledInterview[] = INTERVIEW_SEEDS.flatMap(({ candidateId, inDays, at, ...interview }) => {
    const candidate = refs.get(candidateId);
    return candidate ? [{ ...interview, candidate, scheduledAt: onDay(inDays, at) }] : [];
  });

  const nextInterview = (candidateId: string) =>
    interviews
      .filter((interview) => interview.candidate.id === candidateId && new Date(interview.scheduledAt).getTime() > now)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];

  const candidates = CANDIDATE_SEEDS.map((seed): PipelineCandidate => {
    const upcoming = nextInterview(seed.id);
    return {
      id: seed.id,
      candidateId: seed.id,
      jobId: JOB_SEEDS.find((job) => job.title === seed.role)?.id,
      name: seed.name,
      role: seed.role,
      email: emailFor(seed.name),
      location: seed.location,
      pronouns: seed.pronouns,
      stage: seed.stage,
      lastActivity: seed.lastActivity,
      lastActivityAt: ago(seed.minutesAgo),
      engagement: seed.engagement,
      followUp: seed.followUp ? { reason: seed.followUp } : undefined,
      nextStep: seed.nextStep
        ? { title: seed.nextStep.title, date: onDay(seed.nextStep.inDays, seed.nextStep.at) }
        : upcoming && { title: upcoming.title, date: upcoming.scheduledAt },
      skills: seed.skills,
      addedAt: ago(addedMinutesAgo(seed)),
    };
  });

  const activities = CANDIDATE_SEEDS.flatMap((seed) =>
    activityTimeline(seed).map(
      (item, index): CandidateActivity => ({
        id: `${seed.id}-activity-${index}`,
        candidateId: seed.id,
        kind: item.kind,
        label: item.label,
        occurredAt: ago(item.minutesAgo),
      }),
    ),
  );

  const conversations = CONVERSATION_SEEDS.flatMap(({ candidateId, unread, messages }): Conversation[] => {
    const candidate = refs.get(candidateId);
    if (!candidate) return [];
    return [
      {
        candidate,
        unread,
        messages: messages.map((message, index) => ({
          id: `${candidateId}-message-${index}`,
          author: message.author,
          body: message.body,
          sentAt: ago(message.minutesAgo),
        })),
      },
    ];
  });

  const jobs = JOB_SEEDS.map(({ openedDaysAgo, ...job }) => ({ ...job, openedAt: new Date(now - openedDaysAgo * DAY).toISOString() }));

  return {
    user: SEED_USER,
    trends: SEED_TRENDS,
    candidates,
    archived: [],
    activities,
    interviews,
    conversations,
    jobs,
  };
}

function addedMinutesAgo(seed: CandidateSeed): number {
  return seed.lastActivityKind === "sourced" ? seed.minutesAgo : seed.addedDaysAgo * 24 * 60;
}

/** The seed's own events plus "Added to pipeline" and the stage moves in between. */
function activityTimeline(seed: CandidateSeed): { kind: ActivityKind; label: string; minutesAgo: number }[] {
  const added = addedMinutesAgo(seed);
  const items = [{ kind: seed.lastActivityKind, label: seed.lastActivity, minutesAgo: seed.minutesAgo }, ...(seed.history ?? [])];
  if (seed.lastActivityKind !== "sourced") {
    items.push({ kind: "sourced", label: "Added to pipeline", minutesAgo: added });
  }

  const reached = PIPELINE_STAGES.slice(1, PIPELINE_STAGES.indexOf(seed.stage) + 1);
  reached.forEach((stage, index) => {
    const span = added - seed.minutesAgo;
    items.push({
      kind: "stage",
      label: `Moved to ${STAGE_LABELS[stage]}`,
      minutesAgo: Math.round(added - (span * (index + 1)) / (reached.length + 1)),
    });
  });

  return items.sort((a, b) => a.minutesAgo - b.minutesAgo);
}

function emailFor(name: string): string {
  const ascii = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return `${ascii.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@example.com`;
}
