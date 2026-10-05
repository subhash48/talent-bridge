import { useEffect, useRef } from "react";

import { engagement, type CompanySection } from "@/lib/engagement";

const VISIBLE_SHARE = 0.5; // at least half of it on screen
const DWELL_MS = 1500; // for this long: read, not scrolled past

/**
 * Reports a Company page section as read once it has stayed half on screen for a moment, once per
 * visit to the page. Only the section's name is reported (lib/engagement.ts). Returns the ref for the
 * section's element.
 */
export function useSectionView<T extends HTMLElement>(section: CompanySection | undefined) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !section || typeof IntersectionObserver === "undefined") return;
    let timer: number | undefined;
    let reported = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        window.clearTimeout(timer);
        if (reported || !entry.isIntersecting || entry.intersectionRatio < VISIBLE_SHARE) return;
        timer = window.setTimeout(() => {
          reported = true;
          engagement.track({ type: "company_section_viewed", section });
          observer.disconnect();
        }, DWELL_MS);
      },
      { threshold: [0, VISIBLE_SHARE, 1] },
    );
    observer.observe(element);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [section]);
  return ref;
}
