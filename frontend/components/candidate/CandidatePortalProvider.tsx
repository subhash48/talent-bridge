"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

import { useLiveQuery } from "@/hooks/useLiveQuery";
import { engagement, portalPage } from "@/lib/engagement";
import { rememberApplication } from "@/lib/selected-application";
import { getCandidateMe } from "@/services/portal";
import type { CandidateMeResponse } from "@/types/portal";

type CandidatePortalValue = {
  me: CandidateMeResponse;
  /** The application the portal is showing, or null when the candidate has none. */
  applicationId: string | null;
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
  /** Apply a change straight away, before the next refresh confirms it. */
  update: (change: (me: CandidateMeResponse) => CandidateMeResponse) => void;
};

const CandidatePortalContext = createContext<CandidatePortalValue | null>(null);

/**
 * The signed-in candidate's portal state, seeded by the server layout and kept current: it refetches
 * on focus and every few seconds, so the recruiter's changes (a new interview, a message, a stage
 * move) appear without a reload. It also starts the portal's activity reporting (lib/engagement.ts).
 */
export function CandidatePortalProvider({ initialMe, children }: { initialMe: CandidateMeResponse; children: ReactNode }) {
  const selected = useRef(initialMe.application?.id ?? null);
  const fetchMe = useCallback(() => getCandidateMe(selected.current), []);
  const { data, offline, refresh, setData } = useLiveQuery(fetchMe, { initialData: initialMe });
  const me = data ?? initialMe;
  const applicationId = me.application?.id ?? null;
  const pathname = usePathname();

  const update = useCallback(
    (change: (current: CandidateMeResponse) => CandidateMeResponse) => setData((current) => change(current ?? initialMe)),
    [setData, initialMe],
  );

  const selectApplication = useCallback(
    (id: string) => {
      if (id === selected.current) return;
      selected.current = id;
      rememberApplication(id);
      void refresh();
    },
    [refresh],
  );

  // The server may have picked another application (the remembered one isn't the candidate's any more).
  useEffect(() => {
    if (!applicationId) return;
    selected.current = applicationId;
    rememberApplication(applicationId);
    engagement.start(applicationId);
  }, [applicationId]);
  useEffect(() => () => engagement.stop(), []);
  useEffect(() => {
    if (applicationId) engagement.track({ type: "page_view", page: portalPage(pathname) });
  }, [pathname, applicationId]);

  const value = useMemo(
    () => ({ me, applicationId, selectApplication, offline, refresh, update }),
    [me, applicationId, selectApplication, offline, refresh, update],
  );
  return <CandidatePortalContext value={value}>{children}</CandidatePortalContext>;
}

export function useCandidatePortal() {
  const value = useContext(CandidatePortalContext);
  if (!value) throw new Error("useCandidatePortal must be used inside <CandidatePortalProvider>");
  return value;
}
