import { useCallback, useEffect, useRef, useState } from "react";

import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { errorMessage } from "@/services/api";

type LiveQueryOptions<T> = {
  /** Server-rendered data, so the first paint needs no request. */
  initialData?: T;
  /** How often to refetch while the tab is visible. */
  intervalMs?: number;
};

export type LiveQuery<T> = {
  data: T | undefined;
  /** The last failure; data from an earlier success is kept alongside it. */
  error: string | undefined;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Apply a mutation's result straight away, before the next refetch confirms it. */
  setData: (update: (current: T | undefined) => T | undefined) => void;
};

/**
 * Data that stays current without websockets: it refetches when the tab regains focus and on an
 * interval while visible, so a change made in the recruiter workspace shows up here within seconds.
 * The fetcher must be stable (a module function or a useCallback).
 */
export function useLiveQuery<T>(fetcher: () => Promise<T>, { initialData, intervalMs = 15_000 }: LiveQueryOptions<T> = {}): LiveQuery<T> {
  const [state, setState] = useState<{ data?: T; error?: string }>({ data: initialData });
  const latestRequest = useRef(0);
  const hasInitialData = useRef(initialData !== undefined);

  const refresh = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const data = await fetcher();
      if (request === latestRequest.current) setState({ data });
    } catch (error) {
      if (request === latestRequest.current) setState((current) => ({ data: current.data, error: errorMessage(error) }));
    }
  }, [fetcher]);

  useRefetchOnFocus(() => void refresh());

  useEffect(() => {
    if (!hasInitialData.current) void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, intervalMs]);

  const setData = useCallback((update: (current: T | undefined) => T | undefined) => {
    latestRequest.current += 1; // a refetch already in flight would overwrite this with older data
    setState((current) => ({ data: update(current.data) }));
  }, []);

  return { data: state.data, error: state.error, loading: state.data === undefined && !state.error, refresh, setData };
}
