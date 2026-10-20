"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useLiveQuery } from "@/hooks/useLiveQuery";
import { rememberApplication } from "@/lib/selected-application";
import { getCandidateMe } from "@/services/portal";
import type { CandidateMeResponse } from "@/types/portal";

type CandidatePortalValue = {
  me: CandidateMeResponse;
  /** The application `me` describes, or null when the candidate has none. Pages show this one. */
  applicationId: string | null;
  /** The application the candidate chose. It differs from applicationId while that one loads. */
  selectedId: string | null;
  /** Another application was chosen and hasn't loaded yet: what's on screen is still the previous one's. */
  switching: boolean;
  /** Show another of the candidate's applications across the portal. */
  selectApplication: (applicationId: string) => void;
  /**
   * True when the latest refresh couldn't reach the API (network error or 5xx); the portal keeps
   * showing the last good data and clears this on the next success. A refused request (401/403) is
   * never an outage: apiFetch takes the person to the page that fits their session instead.
   */
  offline: boolean;
  /** Re-read /candidate/me, e.g. after confirming an interview or sending a message. */
  refresh: () => Promise<void>;
  /** Apply a change straight away, before the next refresh confirms it. Ignored while switching. */
  update: (change: (me: CandidateMeResponse) => CandidateMeResponse) => void;
};

const CandidatePortalContext = createContext<CandidatePortalValue | null>(null);

/**
 * The signed-in candidate's portal state, seeded by the server layout and kept current: it refetches
 * on focus and every few seconds, so the recruiter's changes (a new interview, a message, a stage
 * move) appear without a reload. Everything in it describes one application at a time.
 */
export function CandidatePortalProvider({ initialMe, children }: { initialMe: CandidateMeResponse; children: ReactNode }) {
  const [selectedId, setSelectedId] = useState(initialMe.application?.id ?? null);
  const selected = useRef(selectedId);
  const fetchMe = useCallback(async () => {
    const requested = selected.current;
    const me = await getCandidateMe(requested);
    // The server shows the candidate's default application when the one asked for isn't theirs any more.
    const shown = me.application?.id ?? null;
    if (requested === selected.current && shown !== requested) {
      selected.current = shown;
      setSelectedId(shown);
    }
    return me;
  }, []);
  const { data, offline, refresh, setData } = useLiveQuery(fetchMe, { initialData: initialMe });
  const me = data ?? initialMe;
  const applicationId = me.application?.id ?? null;
  const loaded = useRef(applicationId);

  useEffect(() => {
    loaded.current = applicationId;
    if (applicationId) rememberApplication(applicationId);
  }, [applicationId]);

  // A change to the application on screen. While another one loads, it would only cancel that load.
  const update = useCallback(
    (change: (current: CandidateMeResponse) => CandidateMeResponse) => {
      if (loaded.current !== selected.current) return;
      setData((current) => change(current ?? initialMe));
    },
    [setData, initialMe],
  );

  const selectApplication = useCallback(
    (id: string) => {
      if (id === selected.current) return;
      selected.current = id;
      setSelectedId(id);
      rememberApplication(id);
      void refresh();
    },
    [refresh],
  );

  const switching = selectedId !== applicationId;
  const value = useMemo(
    () => ({ me, applicationId, selectedId, switching, selectApplication, offline, refresh, update }),
    [me, applicationId, selectedId, switching, selectApplication, offline, refresh, update],
  );
  return <CandidatePortalContext value={value}>{children}</CandidatePortalContext>;
}

export function useCandidatePortal() {
  const value = useContext(CandidatePortalContext);
  if (!value) throw new Error("useCandidatePortal must be used inside <CandidatePortalProvider>");
  return value;
}
