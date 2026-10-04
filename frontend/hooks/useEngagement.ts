import { useCallback, useEffect, useState } from "react";

import { errorMessage } from "@/services/api";
import { getEngagement } from "@/services/engagement";
import type { EngagementBreakdown, PipelineCandidate } from "@/types/workspace";

type Entry = { version: string; data?: EngagementBreakdown | null; error?: string };

export type EngagementState = {
  /** undefined while loading; null where there is no portal (mock mode). */
  data?: EngagementBreakdown | null;
  error?: string;
  retry: () => void;
  /** Apply a change straight away (e.g. after an invitation), before the next load confirms it. */
  replace: (change: (current: EngagementBreakdown) => EngagementBreakdown) => void;
};

/**
 * One application's engagement breakdown, cached per application. Like the panel's details, it
 * reloads when the pipeline row's last activity changes, keeping the old numbers on screen meanwhile.
 */
export function useEngagement(candidate: PipelineCandidate): EngagementState {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const { id, candidateId } = candidate;
  const version = `${candidate.lastActivityAt}|${candidate.portalLastActiveAt ?? ""}`;
  const entry = entries[id];
  const isCurrent = entry?.version === version;

  useEffect(() => {
    if (isCurrent) return;
    let cancelled = false;
    getEngagement(candidateId, id).then(
      (data) => !cancelled && setEntries((current) => ({ ...current, [id]: { version, data } })),
      (error: unknown) =>
        !cancelled &&
        setEntries((current) => ({ ...current, [id]: { version, data: current[id]?.data, error: errorMessage(error) } })),
    );
    return () => {
      cancelled = true;
    };
  }, [id, candidateId, version, isCurrent]);

  const retry = useCallback(
    () =>
      setEntries((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      }),
    [id],
  );
  const replace = useCallback(
    (change: (current: EngagementBreakdown) => EngagementBreakdown) =>
      setEntries((current) => {
        const existing = current[id];
        return existing?.data ? { ...current, [id]: { ...existing, data: change(existing.data) } } : current;
      }),
    [id],
  );

  return { data: entry?.data, error: entry?.error, retry, replace };
}
