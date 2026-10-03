import { stageOrder } from "@/lib/stages";
import type { EngagementLevel } from "@/types/event";
import type { CandidateStage, PipelineCandidate } from "@/types/workspace";

// Search, filter and sort for the candidate table. Pure functions, so the server-backed version
// can map the same state onto GET /v1/candidates?q=&stage=&engagement=&follow_up= later.

export type StageFilter = "all" | CandidateStage;
export type SortKey = "recent" | "oldest" | "name" | "stage";

export type CandidateFilters = {
  engagement: EngagementLevel[];
  roles: string[];
  followUpOnly: boolean;
};

export const EMPTY_FILTERS: CandidateFilters = { engagement: [], roles: [], followUpOnly: false };

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "oldest", label: "Least recent" },
  { value: "name", label: "Name (A–Z)" },
  { value: "stage", label: "Furthest stage" },
];

export function activeFilterCount(filters: CandidateFilters): number {
  return filters.engagement.length + filters.roles.length + (filters.followUpOnly ? 1 : 0);
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
  if (filters.followUpOnly && !candidate.followUp) return false;
  if (filters.engagement.length && !filters.engagement.includes(candidate.engagement)) return false;
  if (filters.roles.length && !filters.roles.includes(candidate.role)) return false;
  return true;
}

export function sortCandidates(candidates: PipelineCandidate[], sort: SortKey): PipelineCandidate[] {
  const byRecent = (a: PipelineCandidate, b: PipelineCandidate) => b.lastActivityAt.localeCompare(a.lastActivityAt);
  const sorted = [...candidates];
  switch (sort) {
    case "recent":
      return sorted.sort(byRecent);
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
