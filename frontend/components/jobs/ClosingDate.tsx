"use client";

import { useSyncExternalStore } from "react";

const FORMAT: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };
const noChanges = () => () => {};

/**
 * "Closes November 30, 2026", in the reader's own time zone. The employer picks a day in theirs and it's stored as the
 * end of that day, so a server in UTC would show New York's Nov 30 as Dec 1. The server renders UTC, then the browser
 * swaps in its local date once hydrated (a store snapshot, not an effect, so React reconciles it cleanly).
 */
export function ClosingDate({ at, className }: { at: string; className?: string }) {
  const label = useSyncExternalStore(
    noChanges,
    () => new Date(at).toLocaleDateString("en-US", FORMAT),
    () => new Date(at).toLocaleDateString("en-US", { ...FORMAT, timeZone: "UTC" }),
  );
  return <p className={className}>Closes {label}</p>;
}
