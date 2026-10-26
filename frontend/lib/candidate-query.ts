import { stageOrder } from "@/lib/stages";
import { STAGE_LABELS } from "@/types/application";
import type { CommunicationStatus } from "@/types/communication";
import { PIPELINE_STAGES, type CandidateStage, type PipelineCandidate } from "@/types/workspace";

// Search, filter and sort for the candidate table. Pure functions over the whole pipeline (every
// application the recruiter can see), and every filter in force is one the recruiter can see and remove:
// describeFilters lists them as chips, and filtersFromParams reads the same ones from a link (the AI
// Assistant's "Open in Candidates"), so nothing is ever applied out of sight. Communication status says
// whether the candidate is hearing from us on time, never how good they are.

export type StageFilter = "all" | CandidateStage;
export type SortKey = "recent" | "waiting" | "oldest" | "name" | "stage";

/** Portal access as a filter: signed in, or invited and not yet signed in. */
export type PortalFilter = "active" | "invited";
/** upcoming: an interview is booked · interviewed: they've had one · awaiting_update: they've had one and
 * heard nothing since · none: no interview yet. */
export type InterviewFilter = "upcoming" | "interviewed" | "awaiting_update" | "none";
/** How recently they applied. */
export type AppliedFilter = "any" | "7d" | "30d" | "90d";
export type MessagingFilter = "on" | "off";

export type CandidateFilters = {
  /** Job ids. */
  jobs: string[];
  /** Every one of these, from the candidate's own listed skills. */
  skills: string[];
  locations: string[];
  applied: AppliedFilter;
  interview: InterviewFilter[];
  communication: CommunicationStatus[];
  messaging: MessagingFilter[];
  portal: PortalFilter[];
};

export const EMPTY_FILTERS: CandidateFilters = {
  jobs: [],
  skills: [],
  locations: [],
  applied: "any",
  interview: [],
  communication: [],
  messaging: [],
  portal: [],
};

/** The filter behind the "Need an update" metric. */
export const NEEDS_UPDATE: CommunicationStatus[] = ["needs_attention"];

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "waiting", label: "Longest without an update" },
  { value: "oldest", label: "Least recent" },
  { value: "name", label: "Name (A–Z)" },
  { value: "stage", label: "Furthest stage" },
];

export const APPLIED_OPTIONS: { value: AppliedFilter; label: string; days?: number }[] = [
  { value: "any", label: "Any time" },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
];

export const INTERVIEW_OPTIONS: { value: InterviewFilter; label: string }[] = [
  { value: "upcoming", label: "Interview booked" },
  { value: "interviewed", label: "Interviewed" },
  { value: "awaiting_update", label: "Interviewed, no update since" },
  { value: "none", label: "No interview yet" },
];

export const COMMUNICATION_OPTIONS: { value: CommunicationStatus; label: string }[] = [
  { value: "needs_attention", label: "Needs an update" },
  { value: "due_soon", label: "Update due within a day" },
  { value: "on_track", label: "On track" },
];

export const MESSAGING_OPTIONS: { value: MessagingFilter; label: string }[] = [
  { value: "on", label: "Can message you" },
  { value: "off", label: "Messaging off" },
];

export const PORTAL_OPTIONS: { value: PortalFilter; label: string }[] = [
  { value: "active", label: "Portal activated" },
  { value: "invited", label: "Invited, not signed in yet" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function activeFilterCount(filters: CandidateFilters): number {
  return (
    filters.jobs.length +
    filters.skills.length +
    filters.locations.length +
    (filters.applied === "any" ? 0 : 1) +
    filters.interview.length +
    filters.communication.length +
    filters.messaging.length +
    filters.portal.length
  );
}

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

/** Matches name, job, employer, stage, skills, location and email. Every word must match somewhere. */
export function matchesQuery(candidate: PipelineCandidate, query: string): boolean {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    candidate.name,
    candidate.role,
    candidate.company,
    STAGE_LABELS[candidate.stage],
    candidate.location,
    candidate.email,
    ...candidate.skills,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** Where they are with interviews, from what the pipeline row says. */
export function interviewState(candidate: PipelineCandidate): Set<InterviewFilter> {
  const states = new Set<InterviewFilter>();
  if (candidate.nextStep) states.add("upcoming");
  if (candidate.lastInterviewAt) {
    states.add("interviewed");
    const update = candidate.communication.lastUpdateAt;
    if (!update || update < candidate.lastInterviewAt) states.add("awaiting_update");
  }
  if (!candidate.nextStep && !candidate.lastInterviewAt) states.add("none");
  return states;
}

export function matchesFilters(candidate: PipelineCandidate, filters: CandidateFilters, now = Date.now()): boolean {
  if (filters.jobs.length && !(candidate.jobId && filters.jobs.includes(candidate.jobId))) return false;
  if (filters.skills.length && !filters.skills.every((skill) => candidate.skills.some((own) => same(own, skill)))) return false;
  // "London" finds "London, UK": the assistant links with the place as said.
  if (filters.locations.length && !filters.locations.some((place) => candidate.location?.toLowerCase().includes(place.toLowerCase()))) return false;
  const days = APPLIED_OPTIONS.find((option) => option.value === filters.applied)?.days;
  if (days && now - new Date(candidate.addedAt).getTime() > days * DAY_MS) return false;
  if (filters.interview.length) {
    const states = interviewState(candidate);
    if (!filters.interview.some((state) => states.has(state))) return false;
  }
  if (filters.communication.length && !filters.communication.includes(candidate.communication.status)) return false;
  if (filters.messaging.length && !filters.messaging.includes(candidate.candidateMessagingEnabled ? "on" : "off")) return false;
  if (filters.portal.length && !filters.portal.some((status) => status === candidate.portalStatus)) return false;
  return true;
}

export type JobOption = { id: string; label: string };

/** Each job with applicants, by title, naming the employer when two companies use the same title. */
export function jobOptions(candidates: PipelineCandidate[]): JobOption[] {
  const jobs = new Map<string, { title: string; company?: string }>();
  for (const candidate of candidates) {
    if (candidate.jobId && !jobs.has(candidate.jobId)) jobs.set(candidate.jobId, { title: candidate.role, company: candidate.company });
  }
  const titles = new Map<string, number>();
  for (const { title } of jobs.values()) titles.set(title, (titles.get(title) ?? 0) + 1);
  return [...jobs.entries()]
    .map(([id, { title, company }]) => ({ id, label: (titles.get(title) ?? 0) > 1 && company ? `${title} · ${company}` : title }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The distinct values candidates have, most common first, for the skill and location filters. */
export function facetValues(values: (string | undefined)[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const value of values) {
    if (!value) continue;
    const key = value.toLowerCase();
    const entry = counts.get(key) ?? { label: value, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).map((entry) => entry.label);
}

export type ActiveFilter = { key: string; label: string; remove: (filters: CandidateFilters) => CandidateFilters };

const without = <T,>(list: T[], value: T) => list.filter((item) => item !== value);

/** Every filter in force, as the chips the page shows: nothing is ever applied without one. */
export function describeFilters(filters: CandidateFilters, jobs: JobOption[]): ActiveFilter[] {
  const label = <T extends string>(options: { value: T; label: string }[], value: T) =>
    options.find((option) => option.value === value)?.label ?? value;
  return [
    ...filters.jobs.map((id) => ({
      key: `job:${id}`,
      label: `Job: ${jobs.find((job) => job.id === id)?.label ?? "a job with no active applicants"}`,
      remove: (current: CandidateFilters) => ({ ...current, jobs: without(current.jobs, id) }),
    })),
    ...filters.skills.map((skill) => ({
      key: `skill:${skill}`,
      label: `Skill: ${skill}`,
      remove: (current: CandidateFilters) => ({ ...current, skills: without(current.skills, skill) }),
    })),
    ...filters.locations.map((place) => ({
      key: `location:${place}`,
      label: `Location: ${place}`,
      remove: (current: CandidateFilters) => ({ ...current, locations: without(current.locations, place) }),
    })),
    ...(filters.applied === "any"
      ? []
      : [
          {
            key: "applied",
            label: `Applied: ${label(APPLIED_OPTIONS, filters.applied).toLowerCase()}`,
            remove: (current: CandidateFilters) => ({ ...current, applied: "any" as const }),
          },
        ]),
    ...filters.interview.map((state) => ({
      key: `interview:${state}`,
      label: label(INTERVIEW_OPTIONS, state),
      remove: (current: CandidateFilters) => ({ ...current, interview: without(current.interview, state) }),
    })),
    ...filters.communication.map((status) => ({
      key: `communication:${status}`,
      label: label(COMMUNICATION_OPTIONS, status),
      remove: (current: CandidateFilters) => ({ ...current, communication: without(current.communication, status) }),
    })),
    ...filters.messaging.map((value) => ({
      key: `messaging:${value}`,
      label: label(MESSAGING_OPTIONS, value),
      remove: (current: CandidateFilters) => ({ ...current, messaging: without(current.messaging, value) }),
    })),
    ...filters.portal.map((status) => ({
      key: `portal:${status}`,
      label: label(PORTAL_OPTIONS, status),
      remove: (current: CandidateFilters) => ({ ...current, portal: without(current.portal, status) }),
    })),
  ];
}

/** The recruiter's shortlist: the job-related criteria they chose, and how many to show. */
export type Shortlist = { criteria: string[]; size: number };

/** The page's view, as a link carries it (the AI Assistant's "Open in Candidates"). */
export type CandidateView = { query: string; stage: StageFilter; filters: CandidateFilters; shortlist?: Shortlist };

const LIST = "|"; // skills and places can contain commas

function pick<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return values.filter((value): value is T => (allowed as readonly string[]).includes(value));
}

export function viewFromParams(params: URLSearchParams): CandidateView {
  const list = (key: string) => (params.get(key) ?? "").split(LIST).map((value) => value.trim()).filter(Boolean);
  const stage = params.get("stage") ?? "all";
  const applied = params.get("applied") ?? "any";
  const size = Math.round(Number(params.get("shortlist")));
  return {
    ...(size >= 1 && size <= 200 ? { shortlist: { size, criteria: list("criteria").slice(0, 20) } } : {}),
    query: params.get("q") ?? "",
    stage: (PIPELINE_STAGES as readonly string[]).includes(stage) ? (stage as CandidateStage) : "all",
    filters: {
      jobs: list("job"),
      skills: list("skills"),
      locations: list("location"),
      applied: APPLIED_OPTIONS.some((option) => option.value === applied) ? (applied as AppliedFilter) : "any",
      interview: pick(list("interview"), INTERVIEW_OPTIONS.map((option) => option.value)),
      communication: pick(list("communication"), COMMUNICATION_OPTIONS.map((option) => option.value)),
      messaging: pick(list("messaging"), MESSAGING_OPTIONS.map((option) => option.value)),
      portal: pick(list("portal"), PORTAL_OPTIONS.map((option) => option.value)),
    },
  };
}

export function viewToParams({ query, stage, filters, shortlist }: CandidateView): URLSearchParams {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (stage !== "all") params.set("stage", stage);
  const lists: [string, string[]][] = [
    ["job", filters.jobs],
    ["skills", filters.skills],
    ["location", filters.locations],
    ["interview", filters.interview],
    ["communication", filters.communication],
    ["messaging", filters.messaging],
    ["portal", filters.portal],
  ];
  for (const [key, values] of lists) if (values.length) params.set(key, values.join(LIST));
  if (filters.applied !== "any") params.set("applied", filters.applied);
  if (shortlist) {
    params.set("shortlist", String(shortlist.size));
    if (shortlist.criteria.length) params.set("criteria", shortlist.criteria.join(LIST));
  }
  return params;
}

export function sortCandidates(candidates: PipelineCandidate[], sort: SortKey): PipelineCandidate[] {
  const byRecent = (a: PipelineCandidate, b: PipelineCandidate) => b.lastActivityAt.localeCompare(a.lastActivityAt);
  const sorted = [...candidates];
  switch (sort) {
    case "recent":
      return sorted.sort(byRecent);
    case "waiting":
      return sorted.sort((a, b) => b.communication.daysSinceUpdate - a.communication.daysSinceUpdate || byRecent(b, a));
    case "oldest":
      return sorted.sort((a, b) => byRecent(b, a));
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "stage":
      return sorted.sort((a, b) => stageOrder(b.stage) - stageOrder(a.stage) || byRecent(a, b));
  }
}

export function countByStage(candidates: PipelineCandidate[]): Record<StageFilter, number> {
  const counts: Record<StageFilter, number> = { all: candidates.length, sourced: 0, screening: 0, interview: 0, offer: 0, hired: 0 };
  for (const candidate of candidates) counts[candidate.stage] += 1;
  return counts;
}
