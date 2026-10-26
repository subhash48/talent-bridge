import { useEffect, useMemo, useState } from "react";

import type { Shortlist } from "@/lib/candidate-query";
import { errorMessage } from "@/services/api";
import { matchCandidates } from "@/services/candidates";
import type { MatchResult } from "@/types/matching";

/** What POST /candidates/match takes: 20 jobs, and 20 criteria of 60 characters. */
const MAX_JOBS = 20;
const MAX_CRITERIA = 20;
const MAX_CRITERION = 60;

/**
 * The shortlist for the candidates in view: POST /candidates/match with exactly those applications (none
 * listed when everyone is in view), the recruiter's criteria (or, with none, the filtered jobs' own
 * requirements) and the size they chose. Asked again whenever any of them changes; a stale answer never
 * replaces a newer one.
 */
export function useShortlist(shortlist: Shortlist | null, applicationIds: string[] | null, jobIds: string[]) {
  const request = useMemo(
    () =>
      shortlist && {
        ...(applicationIds ? { application_ids: applicationIds } : {}),
        job_ids: jobIds.slice(0, MAX_JOBS),
        skills: shortlist.criteria
          .map((criterion) => criterion.trim().slice(0, MAX_CRITERION))
          .filter(Boolean)
          .slice(0, MAX_CRITERIA),
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
    /** The answer for exactly the candidates, criteria and size on screen; null until it's in. */
    result: shortlist ? (current?.result ?? null) : null,
    /** While the next one is on its way: the last answer, to show faded rather than an empty list. */
    previous: shortlist && !current ? last : null,
    loading: Boolean(shortlist) && !current,
    error: current?.error,
  };
}
