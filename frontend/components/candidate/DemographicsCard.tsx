"use client";

import { LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

import { LoadError } from "@/components/candidate/LoadError";
import { DemographicFields } from "@/components/shared/DemographicFields";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toaster";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { EMPTY_DEMOGRAPHICS, type DemographicAnswers } from "@/lib/demographics";
import { errorMessage } from "@/services/api";
import { getCandidateDemographics, saveCandidateDemographics } from "@/services/portal";

/** The candidate's voluntary demographic answers: optional, theirs alone, reported only in aggregate. */
export function DemographicsCard() {
  const { data, error, refresh, setData } = useLiveQuery(getCandidateDemographics, { intervalMs: 30 * 60_000 });
  return (
    <Card className="p-5 sm:p-5">
      <h2 className="text-base font-semibold tracking-tight text-ink">Voluntary demographic information</h2>
      <p className="mt-1 text-xs text-stone">Optional. Visible only to you. You can change or clear it at any time.</p>
      <div className="mt-4">
        {data ? (
          <DemographicsForm key={JSON.stringify(data)} saved={data} onSaved={(saved) => setData(() => saved)} />
        ) : error ? (
          <LoadError title="This section couldn't load" message={error} onRetry={() => void refresh()} />
        ) : (
          <Skeleton className="h-[180px] rounded-[10px]" />
        )}
      </div>
    </Card>
  );
}

function DemographicsForm({ saved, onSaved }: { saved: DemographicAnswers; onSaved: (saved: DemographicAnswers) => void }) {
  const toast = useToast();
  const [answers, setAnswers] = useState(saved);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(answers) !== JSON.stringify(saved);
  const anything = Object.values(saved).some(Boolean);

  async function save(next: DemographicAnswers, event?: FormEvent) {
    event?.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      onSaved(await saveCandidateDemographics(next));
      toast({ title: "Saved", description: "Your answers are only ever used in aggregate.", tone: "success" });
    } catch (error) {
      toast({ title: "Couldn't save your answers", description: errorMessage(error), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(answers, event)}>
      <DemographicFields value={answers} disabled={saving} onChange={(field, value) => setAnswers((current) => ({ ...current, [field]: value }))} />
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        {anything && (
          <Button variant="ghost" disabled={saving} onClick={() => void save(EMPTY_DEMOGRAPHICS)}>
            Clear my answers
          </Button>
        )}
        <Button type="submit" disabled={!dirty || saving}>
          {saving && <LoaderCircle className="animate-spin" />}
          {saving ? "Saving…" : "Save answers"}
        </Button>
      </div>
    </form>
  );
}
