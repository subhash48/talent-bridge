"use client";

import { Check, CircleHelp, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toaster";
import { firstName } from "@/lib/format";
import { analyzeCandidate } from "@/services/ai";
import { errorMessage } from "@/services/api";
import type { CandidateAnalysis as Analysis, PipelineCandidate } from "@/types/workspace";

type CandidateAnalysisProps = {
  candidate: PipelineCandidate;
  /** The latest saved analysis: null when there is none, undefined while the details load. */
  analysis: Analysis | null | undefined;
};

/** Evidence, gaps and questions from the AI, for the recruiter to review. It never changes a stage. */
export function CandidateAnalysis({ candidate, analysis: saved }: CandidateAnalysisProps) {
  const { refresh } = useWorkspace();
  const toast = useToast();
  const headingId = useId();
  const [generated, setGenerated] = useState<Analysis>();
  const [pending, setPending] = useState(false);
  const analysis = generated ?? saved ?? undefined;

  async function generate() {
    setPending(true);
    try {
      setGenerated(await analyzeCandidate(candidate.id));
      // The analysis is now the latest activity; reload so the row and timeline show it.
      refresh().catch(() => undefined);
    } catch (error) {
      toast({ title: "Couldn't analyze this candidate", description: errorMessage(error), tone: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby={headingId} className="rounded-[14px] bg-white/[0.03] p-4 ring-1 ring-white/[0.07]">
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="flex items-center gap-2 text-[15px] font-medium tracking-tight text-ink">
          <Sparkles aria-hidden className="size-4 text-ai" />
          AI analysis
        </h3>
        <Button variant={analysis ? "ghost" : "ai"} size="sm" onClick={() => void generate()} disabled={pending || saved === undefined}>
          {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : analysis ? <RefreshCw aria-hidden /> : <Sparkles aria-hidden />}
          {pending ? "Analyzing…" : analysis ? "Refresh" : "Analyze"}
        </Button>
      </div>
      {analysis ? (
        <AnalysisBody analysis={analysis} />
      ) : saved === undefined ? (
        <div className="mt-3 flex flex-col gap-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      ) : (
        <p className="mt-2 text-sm text-stone">
          Compare {firstName(candidate.name)}&apos;s profile, interviews and activity with the {candidate.role} requirements, and get
          questions for the next conversation.
        </p>
      )}
    </section>
  );
}

function AnalysisBody({ analysis }: { analysis: Analysis }) {
  const { skillsMatched, missingSkills } = analysis;
  return (
    <div className="mt-3 flex flex-col gap-4 text-sm">
      <p className="leading-relaxed text-charcoal">{analysis.summary}</p>

      {(skillsMatched.length > 0 || missingSkills.length > 0) && (
        <ul aria-label="Job requirements" className="flex flex-wrap gap-1.5">
          {skillsMatched.map(({ skill, evidence }) => (
            <li
              key={skill}
              title={evidence}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-xs text-emerald-200 ring-1 ring-emerald-300/20"
            >
              <Check aria-hidden className="size-3" />
              {skill}
              <span className="sr-only">: evidenced</span>
            </li>
          ))}
          {missingSkills.map((skill) => (
            <li
              key={skill}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-300/30 px-2.5 py-0.5 text-xs text-amber-200"
            >
              <CircleHelp aria-hidden className="size-3" />
              {skill}
              <span className="sr-only">: no evidence yet</span>
            </li>
          ))}
        </ul>
      )}

      <AnalysisList title="Strengths" items={analysis.strengths} />
      <AnalysisList title="To look into" items={analysis.concerns} />

      <div className="rounded-[10px] bg-ai/[0.07] px-3 py-2.5 ring-1 ring-ai/15">
        <p className="text-xs text-stone">Suggested next step</p>
        <p className="mt-0.5 text-charcoal">{analysis.recommendedNextStep}</p>
      </div>

      {skillsMatched.length > 0 && (
        <Disclosure title={`Evidence (${skillsMatched.length})`}>
          <ul className="flex flex-col gap-2">
            {skillsMatched.map(({ skill, evidence }) => (
              <li key={skill}>
                <span className="font-medium text-ink">{skill}:</span> {evidence}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      {analysis.suggestedQuestions.length > 0 && (
        <Disclosure title={`Interview questions (${analysis.suggestedQuestions.length})`}>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:text-faint">
            {analysis.suggestedQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </Disclosure>
      )}

      <p className="text-xs leading-relaxed text-faint">
        Generated <RelativeTime iso={analysis.createdAt} /> by {analysis.modelName ?? "AI"}. Evidence for your review; it never changes a
        stage or makes a decision.
      </p>
    </div>
  );
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-stone">{title}</p>
      <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-charcoal marker:text-faint">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="cursor-pointer rounded-sm text-sm text-charcoal transition-colors select-none hover:text-ink">{title}</summary>
      <div className="mt-2 text-charcoal">{children}</div>
    </details>
  );
}
