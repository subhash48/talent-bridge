import { useCallback, useEffect, useState } from "react";

import { getCandidateDetail } from "@/services/candidates";
import type { CandidateDetail, PipelineCandidate } from "@/types/workspace";

type Entry = { version: string; detail?: CandidateDetail; error?: string };

export type CandidateDetailState = {
  detail?: CandidateDetail;
  loading: boolean;
  error?: string;
  retry: () => void;
};

/**
 * Loads the panel's tab data for one candidate and caches it per candidate.
 * The cache is keyed on lastActivityAt, so a stage change refetches while the old data stays visible.
 */
export function useCandidateDetail(candidate: PipelineCandidate | undefined): CandidateDetailState {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const id = candidate?.id;
  const version = candidate?.lastActivityAt ?? "";
  const entry = id ? entries[id] : undefined;
  const isCurrent = entry?.version === version;

  useEffect(() => {
    if (!id || isCurrent) return;
    let cancelled = false;
    getCandidateDetail(id).then(
      (detail) => {
        if (!cancelled) setEntries((current) => ({ ...current, [id]: { version, detail } }));
      },
      () => {
        if (!cancelled) {
          setEntries((current) => ({
            ...current,
            [id]: { version, detail: current[id]?.detail, error: "Couldn't load this candidate's details." },
          }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, version, isCurrent]);

  const retry = useCallback(() => {
    if (!id) return;
    setEntries((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, [id]);

  return { detail: entry?.detail, loading: !entry?.detail && !entry?.error, error: entry?.error, retry };
}
