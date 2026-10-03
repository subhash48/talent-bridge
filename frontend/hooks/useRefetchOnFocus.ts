import { useEffect, useEffectEvent } from "react";

/**
 * Calls `onFocus` when the tab or window comes back into view, at most once a second (switching
 * tabs fires both focus and visibilitychange). The recruiter workspace and the candidate portal
 * share records, so each re-reads them when someone returns from the other.
 */
export function useRefetchOnFocus(onFocus: () => void): void {
  const handle = useEffectEvent(onFocus);

  useEffect(() => {
    let last = 0;
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 1_000) return;
      last = Date.now();
      handle();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
