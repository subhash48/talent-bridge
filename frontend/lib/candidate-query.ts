import { stageOrder } from "@/lib/stages";
import type { CommunicationStatus } from "@/types/communication";
import type { CandidateStage, PipelineCandidate } from "@/types/workspace";

// Search, filter and sort for the candidate table. Pure functions, so the server-backed version
// can map the same state onto GET /v1/candidates later. Communication status says whether the
// candidate is hearing from us on time, never how good they are.

export type StageFilter = "all" | CandidateStage;
export type SortKey = "recent" | "waiting" | "oldest" | "name" | "stage";

/** Portal access as a filter: signed in, or invited and not yet signed in. */
export type PortalFilter = "active" | "invited";

export type CandidateFilters = {
  communication: CommunicationStatus[];
  roles: string[];
  portal: PortalFilter[];
};

export const EMPTY_FILTERS: CandidateFilters = { communication: [], roles: [], portal: [] };

/** The filter behind the "Need an update" metric. */
export const NEEDS_UPDATE: CommunicationStatus[] = ["needs_attention"];

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "waiting", label: "Longest without an update" },
  { value: "oldest", label: "Least recent" },
  { value: "name", label: "Name (A–Z)" },
  { value: "stage", label: "Furthest stage" },
];

export function activeFilterCount(filters: CandidateFilters): number {
  return filters.communication.length + filters.roles.length + filters.portal.length;
}

/** Matches name, role (the job), skills, location and email. */
export function matchesQuery(candidate: PipelineCandidate, query: string): boolean {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [candidate.name, candidate.role, candidate.location, candidate.email, ...candidate.skills]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function matchesFilters(candidate: PipelineCandidate, filters: CandidateFilters): boolean {
  if (filters.communication.length && !filters.communication.includes(candidate.communication.status)) return false;
  if (filters.roles.length && !filters.roles.includes(candidate.role)) return false;
  if (filters.portal.length && !filters.portal.some((status) => status === candidate.portalStatus)) return false;
  return true;
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
