"use client";

import { ArrowRight, LoaderCircle, Lock, MessagesSquare, RotateCcw } from "lucide-react";
import { useId, useState } from "react";

import { AIMessageContent } from "@/components/ai/AIMessageContent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { errorMessage } from "@/services/api";
import { getMockFeedback } from "@/services/portal";

/**
 * A text mock interview: one practice question at a time, an answer typed in, and coaching on it.
 * Nothing is stored and the hiring team never sees it; the feedback never scores the answer.
 */
export function MockInterview({ questions, applicationId }: { questions: string[]; applicationId: string | null }) {
  const id = useId();
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string>();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string>();
  if (questions.length === 0) return null;
  const question = questions[index % questions.length];

  async function submit() {
    if (!answer.trim() || pending) return;
    setPending(true);
    setProblem(undefined);
    try {
      setFeedback(await getMockFeedback(question, answer.trim(), applicationId));
    } catch (caught) {
      setProblem(errorMessage(caught, "Feedback isn't available right now. Try again in a moment."));
    } finally {
      setPending(false);
    }
  }

  function next() {
    setIndex((current) => current + 1);
    setAnswer("");
    setFeedback(undefined);
    setProblem(undefined);
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
          <MessagesSquare aria-hidden className="size-4 text-stone" /> Mock interview
        </h2>
        <span className="text-xs text-faint tabular-nums">
          Question {(index % questions.length) + 1} of {questions.length}
        </span>
      </div>
      <p className="mt-3 text-[15px] font-medium text-ink">{question}</p>
      <label htmlFor={`${id}-answer`} className="sr-only">
        Your answer
      </label>
      <Textarea
        id={`${id}-answer`}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={5}
        maxLength={4000}
        placeholder="Answer as you would out loud: the situation, what you did, and how it turned out."
        className="field-sizing-content mt-3 max-h-72 min-h-28"
        readOnly={pending}
      />
      {problem && <p className="mt-2 text-sm text-danger">{problem}</p>}
      {feedback && (
        <div className="mt-3 rounded-[10px] bg-ink/[0.04] p-3.5 text-sm ring-1 ring-ink/10" aria-live="polite">
          <AIMessageContent text={feedback} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {feedback ? (
          <>
            <Button size="sm" onClick={next}>
              Next question <ArrowRight />
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setFeedback(undefined)}>
              <RotateCcw /> Try this one again
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ai" onClick={() => void submit()} disabled={pending || !answer.trim()}>
            {pending && <LoaderCircle className="animate-spin" />} {pending ? "Reading your answer…" : "Get feedback"}
          </Button>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-faint">
          <Lock aria-hidden className="size-3.5" /> Private: not saved or shared with the hiring team
        </span>
      </div>
    </Card>
  );
}
