import { useEffect, useMemo, useState } from "react";

import type { Shortlist } from "@/lib/candidate-query";
import { errorMessage } from "@/services/api";
import { matchCandidates } from "@/services/candidates";
import type { MatchResult } from "@/types/matching";

/**
 * The shortlist for the candidates in view: POST /candidates/match with exactly those applications, the
 * recruiter's criteria (or, with none, the filtered jobs' own requirements) and the size they chose.
 * Asked again whenever any of them changes; a stale answer never replaces a newer one.
 */
export function useShortlist(shortlist: Shortlist | null, applicationIds: string[], jobIds: string[]) {
  const request = useMemo(
    () =>
      shortlist && {
        application_ids: applicationIds,
        job_ids: jobIds,
        skills: shortlist.criteria,
        limit: shortlist.size,
      },
    [shortlist, applicationIds, jobIds],
  );
  const key = request ? JSON.stringify(request) : null;
  const [state, setState] = useState<{ key: string; result?: MatchResult; error?: string }>();
  // While a new answer is on its way, the last one stays on screen rather than an empty list.
  const [last, setLast] = useState<MatchResult | null>(null);

  useEffect(() => {
    if (!request || !key) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      matchCandidates(request, controller.signal).then(
        (result) => {
          setState({ key, result });
          setLast(result);
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setState({ key, error: errorMessage(error, "Couldn't find matches. Try again.") });
        },
      );
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [request, key]);

  const current = state?.key === key ? state : undefined;
  return {
    result: shortlist ? (current?.result ?? last) : null,
    loading: Boolean(shortlist) && !current,
    error: current?.error,
  };
}
