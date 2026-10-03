"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import {
  archiveCandidate as archiveCandidateRequest,
  createCandidate,
  restoreCandidate as restoreCandidateRequest,
  updateCandidateStage,
} from "@/services/candidates";
import type { CandidateStage, CurrentUser, NewCandidateInput, PipelineCandidate } from "@/types/workspace";

type WorkspaceValue = {
  user: CurrentUser;
  candidates: PipelineCandidate[];
  unreadThreads: number;
  addCandidate: (input: NewCandidateInput) => Promise<PipelineCandidate>;
  moveCandidate: (id: string, stage: CandidateStage) => Promise<PipelineCandidate>;
  archiveCandidate: (id: string) => Promise<void>;
  restoreCandidate: (id: string) => Promise<void>;
  markThreadRead: () => void;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

type WorkspaceProviderProps = {
  user: CurrentUser;
  initialCandidates: PipelineCandidate[];
  initialUnreadThreads: number;
  children: ReactNode;
};

/**
 * Candidate state shared by every recruiter page, seeded by the server layout. Mutations go through
 * services/candidates and apply the returned record, so they survive client-side navigation.
 */
export function WorkspaceProvider({ user, initialCandidates, initialUnreadThreads, children }: WorkspaceProviderProps) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [unreadThreads, setUnreadThreads] = useState(initialUnreadThreads);

  const replace = useCallback((next: PipelineCandidate) => {
    setCandidates((current) => current.map((candidate) => (candidate.id === next.id ? next : candidate)));
  }, []);

  const addCandidate = useCallback(async (input: NewCandidateInput) => {
    const created = await createCandidate(input);
    setCandidates((current) => [created, ...current]);
    return created;
  }, []);

  const moveCandidate = useCallback(
    async (id: string, stage: CandidateStage) => {
      const updated = await updateCandidateStage(id, stage);
      replace(updated);
      return updated;
    },
    [replace],
  );

  const archiveCandidate = useCallback(async (id: string) => {
    await archiveCandidateRequest(id);
    setCandidates((current) => current.filter((candidate) => candidate.id !== id));
  }, []);

  const restoreCandidate = useCallback(async (id: string) => {
    const restored = await restoreCandidateRequest(id);
    setCandidates((current) => [...current.filter((candidate) => candidate.id !== id), restored]);
  }, []);

  const markThreadRead = useCallback(() => setUnreadThreads((count) => Math.max(0, count - 1)), []);

  const value = useMemo(
    () => ({
      user,
      candidates,
      unreadThreads,
      addCandidate,
      moveCandidate,
      archiveCandidate,
      restoreCandidate,
      markThreadRead,
    }),
    [user, candidates, unreadThreads, addCandidate, moveCandidate, archiveCandidate, restoreCandidate, markThreadRead],
  );

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return value;
}
