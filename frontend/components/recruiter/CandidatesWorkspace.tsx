"use client";

import { ArrowRightLeft, ChevronDown, ChevronLeft, ChevronRight, Plus, SearchX, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { AddCandidateDialog } from "@/components/recruiter/AddCandidateDialog";
import { CandidateDetail } from "@/components/recruiter/CandidateDetail";
import { CandidateFilters } from "@/components/recruiter/CandidateFilters";
import { CandidateTable } from "@/components/recruiter/CandidateTable";
import { DashboardMetrics } from "@/components/recruiter/DashboardMetrics";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import { SearchBar } from "@/components/shared/SearchBar";
import { Button } from "@/components/ui/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/DropdownMenu";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  countByStage,
  matchesFilters,
  matchesQuery,
  sortCandidates,
  type CandidateFilters as Filters,
  type SortKey,
  type StageFilter,
} from "@/lib/candidate-query";
import { firstName, pluralize } from "@/lib/format";
import { STAGE_LABELS } from "@/types/application";
import { PIPELINE_STAGES, type CandidateStage, type MetricKey } from "@/types/workspace";

const PAGE_SIZE = 7;
/** At this width the candidate panel sits beside the table; below it, it opens as a sheet. */
const PANEL_QUERY = "(min-width: 1280px)";

type CandidatesWorkspaceProps = {
  greeting: string;
  trends: Record<MetricKey, number>;
  /** From ?candidate=, so notifications and other pages can deep-link a candidate. */
  initialCandidateId?: string;
};

export function CandidatesWorkspace({ greeting, trends, initialCandidateId }: CandidatesWorkspaceProps) {
  const { user, candidates, moveCandidate } = useWorkspace();
  const toast = useToast();
  const panelInline = useMediaQuery(PANEL_QUERY);

  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<StageFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState(initialCandidateId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [aiFocus, setAiFocus] = useState<{ candidateId: string; key: number }>();
  const [bulkBusy, setBulkBusy] = useState(false);

  // Follow new ?candidate= links while staying on this page (e.g. from the notifications menu).
  const [linkedId, setLinkedId] = useState(initialCandidateId);
  if (initialCandidateId !== linkedId) {
    setLinkedId(initialCandidateId);
    if (initialCandidateId) setSelectedId(initialCandidateId);
  }

  const roles = useMemo(() => [...new Set(candidates.map((candidate) => candidate.role))].sort(), [candidates]);
  const searched = useMemo(
    () => candidates.filter((candidate) => matchesQuery(candidate, query) && matchesFilters(candidate, filters)),
    [candidates, query, filters],
  );
  const counts = useMemo(() => countByStage(searched), [searched]);
  const visible = useMemo(
    () => sortCandidates(stage === "all" ? searched : searched.filter((candidate) => candidate.stage === stage), sort),
    [searched, stage, sort],
  );

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const selected = candidates.find((candidate) => candidate.id === selectedId) ?? sortCandidates(candidates, "recent")[0];
  const checked = candidates.filter((candidate) => checkedIds.has(candidate.id));
  const filtersActive = query.trim() !== "" || activeFilterCount(filters) > 0 || stage !== "all";

  const activeMetric: MetricKey | undefined =
    filters.followUpOnly && stage === "all" ? "followUp" : stage === "interview" ? "interviews" : stage === "offer" ? "offers" : undefined;

  function changeView(update: () => void) {
    update();
    setPage(1);
  }

  function selectMetric(metric: MetricKey) {
    changeView(() => {
      if (metric === "followUp") {
        setStage("all");
        setFilters((current) => ({ ...current, followUpOnly: activeMetric !== "followUp" }));
        return;
      }
      setFilters((current) => ({ ...current, followUpOnly: false }));
      const target: StageFilter = metric === "interviews" ? "interview" : metric === "offers" ? "offer" : "all";
      setStage(activeMetric === metric ? "all" : target);
    });
  }

  function openCandidate(id: string, focusAI: boolean) {
    setSelectedId(id);
    setAiFocus((current) => (focusAI ? { candidateId: id, key: (current?.key ?? 0) + 1 } : undefined));
    if (!window.matchMedia(PANEL_QUERY).matches) setSheetOpen(true);
  }

  function toggleChecked(id: string, isChecked: boolean) {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (isChecked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(isChecked: boolean) {
    setCheckedIds((current) => {
      const next = new Set(current);
      for (const candidate of pageItems) {
        if (isChecked) next.add(candidate.id);
        else next.delete(candidate.id);
      }
      return next;
    });
  }

  async function moveChecked(target: CandidateStage) {
    setBulkBusy(true);
    try {
      await Promise.all(checked.map((candidate) => moveCandidate(candidate.id, target)));
      toast({ title: `${pluralize(checked.length, "candidate")} moved to ${STAGE_LABELS[target]}`, tone: "success" });
      setCheckedIds(new Set());
    } catch {
      toast({ title: "Some candidates couldn't be moved", description: "Please try again.", tone: "error" });
    } finally {
      setBulkBusy(false);
    }
  }

  function clearAll() {
    changeView(() => {
      setQuery("");
      setStage("all");
      setFilters(EMPTY_FILTERS);
    });
  }

  const aiFocusKey = selected && aiFocus?.candidateId === selected.id ? aiFocus.key : undefined;
  const firstShown = (currentPage - 1) * PAGE_SIZE + 1;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex animate-rise flex-col gap-6 pt-1 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-ink">
            <span className="block text-xl text-charcoal sm:text-[22px]">{greeting},</span>
            <span className="mt-1 block text-[56px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[76px]">
              {firstName(user.name)}
            </span>
          </h1>
          <p className="mt-4 text-base text-stone sm:text-[18px]">Here’s what’s happening with your hiring pipeline.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto">
          <GlobalSearch value={query} onChange={(value) => changeView(() => setQuery(value))} />
          <Button size="lg" onClick={() => setAddOpen(true)} className="h-12">
            <Plus /> Add candidate
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="flex min-w-0 flex-col gap-4">
          <DashboardMetrics candidates={candidates} trends={trends} active={activeMetric} onSelect={selectMetric} />

          <section aria-labelledby="candidates-heading" className="glass rounded-[22px] border border-border">
            <CandidateFilters
              stage={stage}
              counts={counts}
              onStageChange={(value) => changeView(() => setStage(value))}
              sort={sort}
              onSortChange={(value) => changeView(() => setSort(value))}
              filters={filters}
              onFiltersChange={(value) => changeView(() => setFilters(value))}
              roles={roles}
            />

            {checked.length > 0 && (
              <BulkActionsBar
                count={checked.length}
                busy={bulkBusy}
                onMove={(target) => void moveChecked(target)}
                onClear={() => setCheckedIds(new Set())}
              />
            )}

            <div className="mt-3">
              <CandidateTable
                candidates={pageItems}
                selectedId={selected?.id}
                checkedIds={checkedIds}
                onSelect={(id) => openCandidate(id, false)}
                onCheckedChange={toggleChecked}
                onCheckAll={toggleAll}
                onAskAI={(id) => openCandidate(id, true)}
                emptyState={
                  candidates.length === 0 ? (
                    <EmptyState
                      icon={UsersRound}
                      title="No candidates yet"
                      description="Add your first candidate to start building the pipeline."
                      action={
                        <Button onClick={() => setAddOpen(true)}>
                          <Plus /> Add candidate
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState
                      icon={SearchX}
                      title="No candidates match"
                      description={query.trim() ? `Nothing matches “${query.trim()}” with the current filters.` : "Try a different stage or clear your filters."}
                      action={
                        filtersActive && (
                          <Button variant="secondary" onClick={clearAll}>
                            Clear search and filters
                          </Button>
                        )
                      }
                    />
                  )
                }
              />
            </div>

            {visible.length > 0 && (
              <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-stone sm:px-6">
                <p aria-live="polite">
                  Showing <span className="text-charcoal tabular-nums">{firstShown}–{firstShown + pageItems.length - 1}</span> of{" "}
                  <span className="text-charcoal tabular-nums">{visible.length}</span>
                </p>
                {pageCount > 1 && (
                  <nav aria-label="Pagination" className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
                      <ChevronLeft />
                    </Button>
                    <span className="px-1 tabular-nums">
                      {currentPage} / {pageCount}
                    </span>
                    <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>
                      <ChevronRight />
                    </Button>
                  </nav>
                )}
              </footer>
            )}
          </section>
        </div>

        {selected && (
          <aside aria-label="Selected candidate" className="hidden xl:sticky xl:top-6 xl:block">
            <CandidateDetail candidate={selected} variant="panel" aiFocusKey={aiFocusKey} />
          </aside>
        )}
      </div>

      <Sheet
        open={sheetOpen && !panelInline && Boolean(selected)}
        onOpenChange={setSheetOpen}
        title={selected ? `${selected.name}, candidate details` : "Candidate details"}
      >
        {selected && <CandidateDetail candidate={selected} variant="sheet" aiFocusKey={aiFocusKey} />}
      </Sheet>

      <AddCandidateDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        roles={roles}
        onCreated={(candidate) => {
          setAddOpen(false);
          changeView(() => {
            setStage("all");
            setSort("recent");
            setQuery("");
          });
          setSelectedId(candidate.id);
        }}
      />
    </div>
  );
}

const subscribeToNothing = () => () => {};

function GlobalSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isMac = useSyncExternalStore(
    subscribeToNothing,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => true,
  );

  // ⌘K / Ctrl+K focuses the search from anywhere on the page.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <SearchBar
      ref={inputRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && value) {
          event.preventDefault();
          onChange("");
        }
      }}
      placeholder="Search candidates, jobs, skills..."
      aria-keyshortcuts="Meta+K Control+K"
      containerClassName="w-full sm:flex-1 xl:w-[360px] xl:flex-none 2xl:w-[440px]"
      className="bg-white/[0.04]"
      trailing={
        <kbd className="hidden h-7 sm:inline-flex items-center gap-1 rounded-[7px] border border-border bg-white/[0.05] px-2 font-sans text-xs text-stone">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      }
    />
  );
}

type BulkActionsBarProps = {
  count: number;
  busy: boolean;
  onMove: (stage: CandidateStage) => void;
  onClear: () => void;
};

function BulkActionsBar({ count, busy, onMove, onClear }: BulkActionsBarProps) {
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="mx-4 mt-4 flex animate-rise flex-wrap items-center gap-2 rounded-[12px] border border-border bg-white/[0.04] py-1.5 pr-1.5 pl-3.5 sm:mx-6"
    >
      <span className="text-sm font-medium text-ink">{count} selected</span>
      <span className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm" disabled={busy}>
            <ArrowRightLeft /> Move to stage <ChevronDown className="text-stone" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {PIPELINE_STAGES.map((stage) => (
            <DropdownMenuItem key={stage} onSelect={() => onMove(stage)}>
              {STAGE_LABELS[stage]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
