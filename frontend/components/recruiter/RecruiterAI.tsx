"use client";

import { CalendarClock, ClipboardList, FileText, ListChecks, MessageSquareText, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import { AIComposer } from "@/components/ai/AIComposer";
import { AIThread } from "@/components/ai/AIThread";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Avatar } from "@/components/shared/Avatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Select } from "@/components/ui/Select";
import { useCandidateAI } from "@/hooks/useCandidateAI";
import { sortCandidates } from "@/lib/candidate-query";
import { firstName, formatSchedule, possessivePronoun } from "@/lib/format";
import { ENGAGEMENT_STYLES } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { ENGAGEMENT_LABELS } from "@/types/event";
import type { PipelineCandidate } from "@/types/workspace";

const COPILOT_SOURCES = [
  { icon: UserRound, label: "Profile and stage" },
  { icon: ListChecks, label: "Activity timeline" },
  { icon: CalendarClock, label: "Interview schedule" },
  { icon: MessageSquareText, label: "Message thread" },
];

// Recruiter Copilot, full page (ARCHITECTURE.md 6.2). Scoped to one candidate at a time, so the
// context the model sees is explicit and the recruiter can always tell what an answer is based on.
export function RecruiterAI({ initialCandidateId }: { initialCandidateId?: string }) {
  const { candidates } = useWorkspace();
  const sorted = useMemo(() => sortCandidates(candidates, "recent"), [candidates]);
  const [candidateId, setCandidateId] = useState(initialCandidateId);
  const candidate = sorted.find((item) => item.id === candidateId) ?? sorted[0];

  return (
    <div>
      <RecruiterHeader title="AI Assistant" subtitle="Summaries, next steps and drafts, grounded in your pipeline data." />
      {candidate ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_324px]">
          <Conversation key={candidate.id} candidate={candidate} />
          <aside aria-label="Context" className="flex flex-col gap-4 xl:sticky xl:top-6">
            <div className="glass rounded-[14px] border border-border p-5">
              <label htmlFor="copilot-focus" className="text-xs font-medium text-stone">
                Candidate in focus
              </label>
              <Select id="copilot-focus" value={candidate.id} onChange={(event) => setCandidateId(event.target.value)} className="mt-2">
                {sorted.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.role}
                  </option>
                ))}
              </Select>
              <CandidateContext candidate={candidate} />
            </div>
            <div className="glass rounded-[14px] border border-border p-5 text-sm">
              <h2 className="flex items-center gap-2 font-medium text-ink">
                <ShieldCheck aria-hidden className="size-4 text-ai" /> What the Copilot uses
              </h2>
              <ul className="mt-3 flex flex-col gap-2 text-stone">
                {COPILOT_SOURCES.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex items-center gap-2.5">
                    <Icon aria-hidden className="size-4" />
                    {label}
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-faint">
                It drafts and explains; it never sends messages or changes stages on its own. Candidates&apos; own AI
                conversations stay private: you see topics, not transcripts.
              </p>
            </div>
          </aside>
        </div>
      ) : (
        <EmptyState icon={Sparkles} title="No candidates to ask about" description="Add a candidate to start using the Copilot." />
      )}
    </div>
  );
}

const STARTERS = [
  { icon: FileText, label: "Summarize profile", prompt: "Summarize candidate" },
  { icon: ListChecks, label: "Suggest next steps", prompt: "What are good next steps?" },
  { icon: MessageSquareText, label: "Draft a follow-up", prompt: "Draft follow-up message" },
  { icon: ClipboardList, label: "Interview brief", prompt: "Prepare an interview brief" },
];

function Conversation({ candidate }: { candidate: PipelineCandidate }) {
  const ai = useCandidateAI(candidate.id);
  const first = firstName(candidate.name);

  return (
    <section
      aria-label={`Conversation about ${candidate.name}`}
      className="glass flex min-h-[504px] flex-col rounded-[16px] border border-border p-4 sm:p-5 xl:h-[calc(100dvh-15rem)]"
    >
      {ai.messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-ai/10 ring-1 ring-ai/20">
            <Sparkles aria-hidden className="size-5 text-ai" />
          </span>
          <h2 className="mt-3.5 text-lg font-semibold tracking-tight text-ink">How can I help with {first}?</h2>
          <p className="mt-1.5 max-w-sm text-sm text-stone">Pick a starting point or ask anything about {possessivePronoun(candidate.pronouns)} application.</p>
          <div className="mt-5 grid w-full max-w-lg gap-2 sm:grid-cols-2">
            {STARTERS.map(({ icon: Icon, label, prompt }) => (
              <button
                key={label}
                type="button"
                onClick={() => void ai.send(prompt)}
                className="flex items-center gap-2.5 rounded-[10px] border border-border bg-ink/[0.03] px-3.5 py-2.5 text-left text-sm text-charcoal transition-[background-color,border-color,color] duration-200 hover:border-ai/30 hover:bg-ai/[0.07] hover:text-ink"
              >
                <Icon aria-hidden className="size-4 shrink-0 text-ai" />
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <AIThread messages={ai.messages} className="min-h-0 flex-1 pb-2" />
      )}
      <AIComposer
        className="mt-4 border-t border-border pt-4"
        id="copilot-prompt"
        label={`Ask about ${first}`}
        placeholder={`Ask anything about ${first}…`}
        suggestions={ai.messages.length ? STARTERS.slice(0, 3).map((starter) => starter.prompt) : []}
        pending={ai.pending}
        onSend={ai.send}
        onStop={ai.stop}
      />
    </section>
  );
}

function CandidateContext({ candidate }: { candidate: PipelineCandidate }) {
  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center gap-3">
        <Avatar name={candidate.name} src={candidate.avatarUrl} size={36} />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-ink">{candidate.name}</p>
          <p className="truncate text-[13px] text-stone">{candidate.role}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
        <dt className="text-stone">Stage</dt>
        <dd>
          <StatusBadge stage={candidate.stage} className="h-6" />
        </dd>
        <dt className="text-stone">Engagement</dt>
        <dd className={cn("font-medium", ENGAGEMENT_STYLES[candidate.engagement])}>{ENGAGEMENT_LABELS[candidate.engagement]}</dd>
        <dt className="text-stone">Next step</dt>
        <dd className="text-charcoal" suppressHydrationWarning>
          {candidate.nextStep ? `${candidate.nextStep.title}, ${formatSchedule(candidate.nextStep.date)}` : "Nothing scheduled"}
        </dd>
        <dt className="text-stone">Latest</dt>
        <dd className="text-charcoal">
          {candidate.lastActivity}, <RelativeTime iso={candidate.lastActivityAt} />
        </dd>
      </dl>
    </div>
  );
}
