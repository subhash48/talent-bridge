"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import {
  archiveCandidate as archiveCandidateRequest,
  createCandidate,
  getCandidates,
  restoreCandidate as restoreCandidateRequest,
  updateCandidateStage,
} from "@/services/candidates";
import { getUnreadThreadCount } from "@/services/messages";
import type { CandidateStage, CurrentUser, JobOpening, NewCandidateInput, PipelineCandidate } from "@/types/workspace";

type WorkspaceValue = {
  user: CurrentUser;
  candidates: PipelineCandidate[];
  jobs: JobOpening[];
  unreadThreads: number;
  /** Increases after every change, so views that query the API themselves know to refetch. */
  revision: number;
  /** Reload the pipeline from the API, e.g. after scheduling an interview or messaging. */
  refresh: () => Promise<void>;
  addCandidate: (input: NewCandidateInput) => Promise<PipelineCandidate>;
  moveCandidate: (id: string, stage: CandidateStage) => Promise<PipelineCandidate>;
  archiveCandidate: (id: string) => Promise<void>;
  restoreCandidate: (id: string) => Promise<void>;
  markThreadRead: () => void;
  /** Re-read the unread conversation count, e.g. after a candidate's reply was marked read. */
  syncUnreadThreads: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

type WorkspaceProviderProps = {
  user: CurrentUser;
  initialCandidates: PipelineCandidate[];
  initialJobs: JobOpening[];
  initialUnreadThreads: number;
  children: ReactNode;
};

/**
 * Candidate state shared by every recruiter page, seeded by the server layout. Mutations go through
 * services/candidates and apply the returned record, so they survive client-side navigation.
 */
export function WorkspaceProvider({ user, initialCandidates, initialJobs, initialUnreadThreads, children }: WorkspaceProviderProps) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [unreadThreads, setUnreadThreads] = useState(initialUnreadThreads);
  const [revision, setRevision] = useState(0);

  const changed = useCallback(() => setRevision((current) => current + 1), []);

  const replace = useCallback(
    (next: PipelineCandidate) => {
      setCandidates((current) => current.map((candidate) => (candidate.id === next.id ? next : candidate)));
      changed();
    },
    [changed],
  );

  const refresh = useCallback(async () => {
    setCandidates(await getCandidates());
    changed();
  }, [changed]);

  const syncUnreadThreads = useCallback(async () => {
    setUnreadThreads(await getUnreadThreadCount());
  }, []);

  // Candidates confirm interviews, reply and edit their details in the candidate portal, which
  // writes to these same records: re-read them when the recruiter comes back to this tab.
  useRefetchOnFocus(() => {
    refresh().catch(() => undefined);
    syncUnreadThreads().catch(() => undefined);
  });

  const addCandidate = useCallback(
    async (input: NewCandidateInput) => {
      const created = await createCandidate(input);
      setCandidates((current) => [created, ...current.filter((candidate) => candidate.id !== created.id)]);
      changed();
      // The new row shows straight away; then the list is re-read from the server.
      refresh().catch(() => undefined);
      return created;
    },
    [changed, refresh],
  );

  const moveCandidate = useCallback(
    async (id: string, stage: CandidateStage) => {
      const updated = await updateCandidateStage(id, stage);
      replace(updated);
      return updated;
    },
    [replace],
  );

  const archiveCandidate = useCallback(
    async (id: string) => {
      await archiveCandidateRequest(id);
      setCandidates((current) => current.filter((candidate) => candidate.id !== id));
      changed();
    },
    [changed],
  );

  const restoreCandidate = useCallback(
    async (id: string) => {
      const restored = await restoreCandidateRequest(id);
      setCandidates((current) => [...current.filter((candidate) => candidate.id !== id), restored]);
      changed();
    },
    [changed],
  );

  const markThreadRead = useCallback(() => setUnreadThreads((count) => Math.max(0, count - 1)), []);

  const value = useMemo(
    () => ({
      user,
      candidates,
      jobs: initialJobs,
      unreadThreads,
      revision,
      refresh,
      addCandidate,
      moveCandidate,
      archiveCandidate,
      restoreCandidate,
      markThreadRead,
      syncUnreadThreads,
    }),
    [
      user,
      candidates,
      initialJobs,
      unreadThreads,
      revision,
      refresh,
      addCandidate,
      moveCandidate,
      archiveCandidate,
      restoreCandidate,
      markThreadRead,
      syncUnreadThreads,
    ],
  );

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return value;
}
