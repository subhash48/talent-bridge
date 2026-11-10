"use client";

import { LoaderCircle, MapPin, Search } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useBoard } from "@/components/jobs/BoardNavigation";
import { withChanges } from "@/components/jobs/board";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// Each field is a plain transparent input on the one frosted bar, so there's no second layer of white behind the text.
const FIELD =
  "h-12 w-full min-w-0 rounded-[14px] bg-transparent pr-4 pl-11 text-base text-ink placeholder:text-stone focus-visible:bg-white/45 sm:text-[0.9375rem] md:rounded-full";

/** As the board's URL keeps it: single spaces, at most the API's 100 characters. */
function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 100);
}

/**
 * The keyword and location search. It's a real GET form to /jobs carrying the current filters, so it works before
 * the page's script has loaded; once it has, a search goes through the board's transition instead.
 */
export function JobSearchForm({ className }: { className?: string }) {
  const { query, pending, go } = useBoard();
  const [keywords, setKeywords] = useState(query.q);
  const [location, setLocation] = useState(query.location);
  // When the board's state changes from elsewhere (Clear filters, the back button), the fields follow it.
  const [synced, setSynced] = useState({ q: query.q, location: query.location });
  if (synced.q !== query.q || synced.location !== query.location) {
    setSynced({ q: query.q, location: query.location });
    setKeywords(query.q);
    setLocation(query.location);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go(withChanges(query, { q: tidy(keywords), location: tidy(location) }));
  }

  return (
    <form
      role="search"
      aria-label="Search jobs"
      action="/jobs"
      method="get"
      onSubmit={submit}
      className={cn(
        "sky-card flex flex-col gap-1 rounded-[22px] p-2 md:flex-row md:items-center md:gap-0 md:rounded-full md:p-1.5 md:pl-2",
        className,
      )}
    >
      <div className="relative flex-[1.35]">
        <label htmlFor="jobs-q" className="sr-only">
          Job title, skill or company
        </label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-brand-ink" />
        <input
          id="jobs-q"
          name="q"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          maxLength={100}
          value={keywords}
          onChange={(event) => setKeywords(event.target.value)}
          placeholder="Job title, skill or company"
          className={FIELD}
        />
      </div>
      <span aria-hidden className="mx-3 h-px bg-ink/10 md:mx-0 md:h-7 md:w-px" />
      <div className="relative flex-1">
        <label htmlFor="jobs-location" className="sr-only">
          Location
        </label>
        <MapPin aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-brand-ink" />
        <input
          id="jobs-location"
          name="location"
          type="text"
          enterKeyHint="search"
          autoComplete="address-level2"
          maxLength={100}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="City, region or remote"
          className={FIELD}
        />
      </div>
      {/* Without script, the form still keeps the filters and the tab. */}
      {query.arrangement.map((value) => (
        <input key={`arrangement-${value}`} type="hidden" name="arrangement" value={value} />
      ))}
      {query.type.map((value) => (
        <input key={`type-${value}`} type="hidden" name="type" value={value} />
      ))}
      {query.salary && <input type="hidden" name="salary" value={query.salary} />}
      {query.posted && <input type="hidden" name="posted" value={query.posted} />}
      {query.source && <input type="hidden" name="source" value={query.source} />}
      <button
        type="submit"
        className={buttonStyles({ size: "lg", className: "mt-1 h-12 w-full px-7 text-[0.9375rem] md:mt-0 md:ml-1.5 md:w-auto" })}
      >
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Search aria-hidden />}
        Search
      </button>
    </form>
  );
}
