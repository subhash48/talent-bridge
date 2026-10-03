import { useEffect, useState } from "react";

import type { StageFilter } from "@/lib/candidate-query";
import { getCandidates } from "@/services/candidates";
import type { PipelineCandidate } from "@/types/workspace";

/**
 * One stage of the pipeline, filtered by the API (GET /candidates?stage=...) and refetched whenever
 * the workspace changes. Undefined for "all", and until the response for the current stage and
 * revision arrives, so callers can show the local filter in the meantime.
 */
export function useStageCandidates(stage: StageFilter, revision: number): PipelineCandidate[] | undefined {
  const key = `${stage}:${revision}`;
  const [result, setResult] = useState<{ key: string; candidates: PipelineCandidate[] }>();

  useEffect(() => {
    if (stage === "all") return;
    let cancelled = false;
    getCandidates({ stage }).then(
      (candidates) => {
        if (!cancelled) setResult({ key, candidates });
      },
      () => {
        // Keep showing the local filter; the next change retries.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [stage, key]);

  return stage !== "all" && result?.key === key ? result.candidates : undefined;
}
