import type { Metadata } from "next";

import { BoardFilters } from "@/components/jobs/BoardFilters";
import { BoardProvider, BoardResults } from "@/components/jobs/BoardNavigation";
import { BoardPagination } from "@/components/jobs/BoardPagination";
import { BoardEmpty, BoardUnavailable, NoMatches, PastTheEnd } from "@/components/jobs/BoardStates";
import { JobCard } from "@/components/jobs/JobCard";
import { JobSearchForm } from "@/components/jobs/JobSearchForm";
import { SourceTabs } from "@/components/jobs/SourceTabs";
import { boardSearch, isNarrowed, pageCount, parseBoardQuery, resultsLabel, type BoardQuery } from "@/components/jobs/board";
import { ApiError, isServerUnavailable } from "@/services/api";
import { searchJobs } from "@/services/careers";
import type { JobBoardPage } from "@/types/careers";

export const metadata: Metadata = { title: "Find jobs" };

type JobsPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Public wording for a failed search: the API's own message only when it answered with one. */
function failure(error: unknown): string {
  if (error instanceof ApiError && !isServerUnavailable(error)) return error.message;
  return "We couldn't reach Hirvello just now. Check your connection, then try again.";
}

// The job board. Its state is its URL (search, location, filters, tab and page), so every search can be shared,
// and the server renders each one fresh: a job shows the moment it opens and goes the moment it closes.
export default async function JobsPage({ searchParams }: JobsPageProps) {
  const query = parseBoardQuery(await searchParams);
  const result = await searchJobs(query).then(
    (page) => ({ page }),
    (error: unknown) => ({ error: failure(error) }),
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 pb-20 sm:px-8">
      <header className="mx-auto max-w-[880px] pt-6 text-center sm:pt-10">
        <p className="text-[0.9375rem] font-semibold text-brand-ink">Hirvello job board</p>
        <h1 className="mt-3 text-[clamp(2.125rem,4.4vw,3.5rem)] leading-[1.05] font-bold tracking-[-0.035em] text-balance text-ink">
          Find your next opportunity.
        </h1>
        <p className="mx-auto mt-4 max-w-[560px] text-[1.0625rem] leading-relaxed text-pretty text-charcoal">
          Explore opportunities from recruiters and growing businesses—all in one place.
        </p>
      </header>

      <BoardProvider query={query}>
        <JobSearchForm className="mx-auto mt-8 max-w-[880px] sm:mt-10" />
        <div className="mt-10 sm:mt-14">
          {"error" in result ? <BoardUnavailable message={result.error} /> : <Board query={query} page={result.page} />}
        </div>
      </BoardProvider>
    </div>
  );
}

function Board({ query, page }: { query: BoardQuery; page: JobBoardPage }) {
  // An empty board with nothing narrowing it: the tabs and filters would only lead to more nothing.
  if (page.counts.all === 0 && !isNarrowed(query)) return <BoardEmpty />;

  const from = boardSearch(query);
  const pages = pageCount(page.total, page.limit);
  return (
    <>
      <SourceTabs counts={page.counts} />
      <BoardFilters className="mt-5" />
      <BoardResults className="mt-6">
        {page.jobs.length > 0 ? (
          <>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p aria-live="polite" className="text-[0.9375rem] text-charcoal">
                <span className="font-semibold text-ink">{resultsLabel(page.total, query.page, page.jobs.length, page.limit)}</span>
                {query.q && <> for &ldquo;{query.q}&rdquo;</>}
                {query.location && <> in {query.location}</>}
              </p>
              <p className="text-[13px] text-stone">Newest first</p>
            </div>
            <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {page.jobs.map((job) => (
                <li key={job.id} className="min-w-0">
                  <JobCard job={job} from={from} />
                </li>
              ))}
            </ul>
            <BoardPagination page={query.page} pages={pages} />
          </>
        ) : page.total > 0 ? (
          <PastTheEnd query={query} />
        ) : (
          <NoMatches query={query} allCount={page.counts.all} />
        )}
      </BoardResults>
    </>
  );
}
