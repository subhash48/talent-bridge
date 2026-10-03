import type { PortalHome } from "@/types/candidate";

export type CandidateState = {
  data: PortalHome | null;
  loading: boolean;
  error: Error | null;
};

export function useCandidate(): CandidateState {
  // TODO: load GET /v1/portal/home and refetch on realtime pings (ARCHITECTURE.md 5.6, 8.3).
  return { data: null, loading: false, error: null };
}
