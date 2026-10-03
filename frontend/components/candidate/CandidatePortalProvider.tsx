"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import { useLiveQuery } from "@/hooks/useLiveQuery";
import { getCandidateMe } from "@/services/portal";
import type { CandidateMeResponse } from "@/types/portal";

type CandidatePortalValue = {
  me: CandidateMeResponse;
  /**
   * True when the latest refresh couldn't reach the API (network error or 5xx); the portal keeps
   * showing the last good data and clears this on the next success. A refused request (401/403) is
   * never an outage: apiFetch takes the person to the page that fits their session instead.
   */
  offline: boolean;
  /** Re-read /candidate/me, e.g. after confirming an interview or sending a message. */
  refresh: () => Promise<void>;
  /** Apply a change straight away, before the next refresh confirms it. */
  update: (change: (me: CandidateMeResponse) => CandidateMeResponse) => void;
};

const CandidatePortalContext = createContext<CandidatePortalValue | null>(null);

/**
 * The signed-in candidate's portal state, seeded by the server layout and kept current: it refetches
 * on focus and every few seconds, so the recruiter's changes (a new interview, a message, a stage
 * move) appear without a reload.
 */
export function CandidatePortalProvider({ initialMe, children }: { initialMe: CandidateMeResponse; children: ReactNode }) {
  const { data, offline, refresh, setData } = useLiveQuery(getCandidateMe, { initialData: initialMe });
  const me = data ?? initialMe;

  const update = useCallback(
    (change: (current: CandidateMeResponse) => CandidateMeResponse) => setData((current) => change(current ?? initialMe)),
    [setData, initialMe],
  );

  const value = useMemo(() => ({ me, offline, refresh, update }), [me, offline, refresh, update]);
  return <CandidatePortalContext value={value}>{children}</CandidatePortalContext>;
}

export function useCandidatePortal() {
  const value = useContext(CandidatePortalContext);
  if (!value) throw new Error("useCandidatePortal must be used inside <CandidatePortalProvider>");
  return value;
}
