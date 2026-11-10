// The job board's state and wording, kept free of React so tests/jobs.test.mjs can run it in Node.
// The board's state lives in the URL (/jobs?q=…&arrangement=remote&page=2), so a search can be shared and is
// rendered on the server; everything here reads that URL defensively, because anyone can type one.

import type { JobSource, SalaryPeriod } from "@/types/careers";

/** Jobs per page, and the API's limit for each request. */
export const PAGE_SIZE = 20;

/** The API caps free text at 100 characters. */
const MAX_TEXT = 100;
/** Past this, a page number is a typo rather than a page anyone reached. */
const MAX_PAGE = 500;

export type Arrangement = "remote" | "hybrid" | "onsite";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship";
export type SalaryFilter = "listed" | "50k" | "80k" | "100k" | "150k";
export type PostedFilter = "1" | "3" | "7" | "14" | "30";

type Choice<T extends string> = { value: T; label: string };

export const ARRANGEMENTS: readonly Choice<Arrangement>[] = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

export const EMPLOYMENT_TYPES: readonly Choice<EmploymentType>[] = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
];

/** "Any" is no filter at all. A minimum is yearly pay; the API annualises hourly and monthly ranges to compare. */
export const SALARIES: readonly (Choice<SalaryFilter> & { api: string })[] = [
  { value: "listed", label: "Salary listed", api: "listed" },
  { value: "50k", label: "$50k+ USD / year", api: "50000" },
  { value: "80k", label: "$80k+ USD / year", api: "80000" },
  { value: "100k", label: "$100k+ USD / year", api: "100000" },
  { value: "150k", label: "$150k+ USD / year", api: "150000" },
];

/** "Any time" is no filter. The value is the number of days, as the API takes it. */
export const POSTED: readonly Choice<PostedFilter>[] = [
  { value: "1", label: "Past 24 hours" },
  { value: "3", label: "Past 3 days" },
  { value: "7", label: "Past week" },
  { value: "14", label: "Past 2 weeks" },
  { value: "30", label: "Past month" },
];

/** The three tabs; counts come from the API's `counts`, which ignore the source so each tab's number is honest. */
export const SOURCE_TABS: readonly { source: JobSource | null; label: string; count: "all" | JobSource }[] = [
  { source: null, label: "All Jobs", count: "all" },
  { source: "recruiter", label: "Recruiter Jobs", count: "recruiter" },
  { source: "small_business", label: "Small Business Jobs", count: "small_business" },
];

export type BoardQuery = {
  q: string;
  location: string;
  arrangement: Arrangement[];
  type: EmploymentType[];
  salary: SalaryFilter | null;
  posted: PostedFilter | null;
  source: JobSource | null;
  /** 1-based. */
  page: number;
};

export const EMPTY_QUERY: BoardQuery = {
  q: "",
  location: "",
  arrangement: [],
  type: [],
  salary: null,
  posted: null,
  source: null,
  page: 1,
};

/** What Next passes a page as searchParams, or the browser's URLSearchParams. */
export type RawSearchParams = Record<string, string | string[] | undefined> | URLSearchParams;

function all(params: RawSearchParams, key: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key);
  const value = params[key];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function first(params: RawSearchParams, key: string): string | undefined {
  return all(params, key)[0];
}

/** Only the known values, each once, in the order the filter lists them (so the same filters make the same URL). */
function pick<T extends string>(values: string[], choices: readonly Choice<T>[]): T[] {
  const wanted = new Set(values.flatMap((value) => value.split(",")).map((value) => value.trim().toLowerCase()));
  return choices.filter((choice) => wanted.has(choice.value)).map((choice) => choice.value);
}

function one<T extends string>(value: string | undefined, choices: readonly Choice<T>[]): T | null {
  const text = value?.trim().toLowerCase();
  return choices.find((choice) => choice.value === text)?.value ?? null;
}

function text(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

/** The board's state from its URL. Anything unknown or malformed is dropped rather than refused. */
export function parseBoardQuery(params: RawSearchParams): BoardQuery {
  const source = first(params, "source")?.trim().toLowerCase().replace(/-/g, "_");
  const page = Number(first(params, "page"));
  return {
    q: text(first(params, "q")),
    location: text(first(params, "location")),
    arrangement: pick(all(params, "arrangement"), ARRANGEMENTS),
    type: pick(all(params, "type"), EMPLOYMENT_TYPES),
    salary: one(first(params, "salary"), SALARIES),
    posted: one(first(params, "posted"), POSTED),
    source: source === "recruiter" || source === "small_business" ? source : null,
    page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

/** The board's URL query, without the "?": empty for the plain board. The order is fixed, so equal states give equal URLs. */
export function boardSearch(query: BoardQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.location) params.set("location", query.location);
  for (const value of query.arrangement) params.append("arrangement", value);
  for (const value of query.type) params.append("type", value);
  if (query.salary) params.set("salary", query.salary);
  if (query.posted) params.set("posted", query.posted);
  if (query.source) params.set("source", query.source);
  if (query.page > 1) params.set("page", String(query.page));
  return params.toString();
}

/**
 * The board with some of its state changed. Any change but the page itself starts again from page 1, since
 * page 3 of different results means nothing.
 */
export function withChanges(query: BoardQuery, changes: Partial<BoardQuery>): BoardQuery {
  return { ...query, ...changes, page: changes.page ?? 1 };
}

export function boardHref(query: BoardQuery): string {
  const search = boardSearch(query);
  return search ? `/jobs?${search}` : "/jobs";
}

/** The query GET /careers/search takes for this state. */
export function apiSearchParams(query: BoardQuery, limit = PAGE_SIZE): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.location) params.set("location", query.location);
  for (const value of query.arrangement) params.append("arrangement", value);
  for (const value of query.type) params.append("type", value);
  const salary = SALARIES.find((choice) => choice.value === query.salary);
  if (salary) params.set("salary", salary.api);
  if (query.posted) params.set("posted_within", query.posted);
  if (query.source) params.set("source", query.source);
  params.set("limit", String(limit));
  params.set("offset", String((query.page - 1) * limit));
  return params;
}

/** The filter row's choices that are set (the search, the location and the tab aren't filters). */
export function activeFilterCount(query: BoardQuery): number {
  return query.arrangement.length + query.type.length + (query.salary ? 1 : 0) + (query.posted ? 1 : 0);
}

/** Whether anything narrows the board: a search, a location, a filter or a tab. */
export function isNarrowed(query: BoardQuery): boolean {
  return Boolean(query.q || query.location || query.source || activeFilterCount(query) > 0);
}

/** The filter row cleared; the search, the location and the tab stay. */
export function withoutFilters(query: BoardQuery): BoardQuery {
  return withChanges(query, { arrangement: [], type: [], salary: null, posted: null });
}

/** What a filter button says once something is chosen: "Remote", "Remote +1"; null when nothing is. */
export function choiceSummary<T extends string>(values: readonly T[], choices: readonly Choice<T>[]): string | null {
  const labels = choices.filter((choice) => values.includes(choice.value)).map((choice) => choice.label);
  if (labels.length === 0) return null;
  return labels.length === 1 ? labels[0] : `${labels[0]} +${labels.length - 1}`;
}

export function choiceLabel<T extends string>(value: T | null, choices: readonly Choice<T>[]): string | null {
  return choices.find((choice) => choice.value === value)?.label ?? null;
}

/** Number of pages for a total; at least one, so "Page 1 of 1" still reads. */
export function pageCount(total: number, limit = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / limit));
}

/** "Showing 21–40 of 45 jobs", "1 job", "12 jobs". */
export function resultsLabel(total: number, page: number, shown: number, limit = PAGE_SIZE): string {
  const noun = total === 1 ? "job" : "jobs";
  if (total <= limit || shown === 0) return `${total.toLocaleString("en-US")} ${noun}`;
  const start = (page - 1) * limit + 1;
  return `Showing ${start}–${start + shown - 1} of ${total.toLocaleString("en-US")} ${noun}`;
}

// A job's own pages carry the board's state as ?from=…, so "All jobs" goes back to the same search.

/** /jobs/{id}, or /jobs/{id}/apply, keeping the board's state for the way back. */
export function jobHref(id: string, from = "", page: "details" | "apply" = "details"): string {
  const path = `/jobs/${encodeURIComponent(id)}${page === "apply" ? "/apply" : ""}`;
  return from ? `${path}?from=${encodeURIComponent(from)}` : path;
}

/**
 * The board's state from a job page's ?from=, read through parseBoardQuery so only the board's own parameters
 * survive: the way back can never point anywhere but /jobs.
 */
export function boardFrom(from: string | string[] | undefined): string {
  const value = Array.isArray(from) ? from[0] : from;
  if (!value) return "";
  return boardSearch(parseBoardQuery(new URLSearchParams(value)));
}

// Pay and dates, as the cards say them.

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", INR: "₹", CAD: "CA$", AUD: "A$" };
const PERIODS: Record<SalaryPeriod, string> = { year: "a year", month: "a month", hour: "an hour" };

function amount(value: number, symbol: string): string {
  // Rounded before the unit is chosen, so 999,960 reads "$1M", never "$1000k".
  const thousands = Number((value / 1000).toFixed(1));
  if (thousands >= 1000) return `${symbol}${Number((value / 1_000_000).toFixed(2))}M`;
  if (value >= 1000) return `${symbol}${thousands}k`;
  return `${symbol}${value.toLocaleString("en-US")}`;
}

/**
 * A pay range as people say it: "$120k–$150k a year", "$18–$22 an hour", "From $90k a year", "Up to €4k a month".
 * Null without a number. A range with no period is yearly, and one with no currency is in dollars (the API's defaults).
 */
export function formatPayRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency?: string | null,
  period?: SalaryPeriod | null,
): string | null {
  const low = min != null && min >= 0 ? min : null;
  const high = max != null && max >= 0 ? max : null;
  if (low === null && high === null) return null;
  const code = (currency || "USD").toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code] ?? `${code} `;
  const per = PERIODS[period ?? "year"] ?? PERIODS.year;
  if (low !== null && high !== null) {
    return low === high ? `${amount(low, symbol)} ${per}` : `${amount(low, symbol)}–${amount(high, symbol)} ${per}`;
  }
  return low !== null ? `From ${amount(low, symbol)} ${per}` : `Up to ${amount(high as number, symbol)} ${per}`;
}

const DAY = 24 * 60 * 60 * 1000;

/** "Posted today", "Posted yesterday", "Posted 3 days ago", "Posted 2 weeks ago", "Posted 1 month ago". */
export function postedLabel(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  const days = Math.floor((now - time) / DAY);
  if (days < 1) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 7) return `Posted ${days} days ago`;
  const unit = (count: number, word: string) => `Posted ${count} ${word}${count === 1 ? "" : "s"} ago`;
  if (days < 30) return unit(Math.floor(days / 7), "week");
  if (days < 365) return unit(Math.floor(days / 30), "month");
  return unit(Math.floor(days / 365), "year");
}
