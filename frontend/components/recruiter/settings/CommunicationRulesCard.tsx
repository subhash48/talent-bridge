"use client";

import { LoaderCircle, TimerReset } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import { errorMessage } from "@/services/api";
import { updateCommunicationRule } from "@/services/communication";
import type { CommunicationRuleSetting } from "@/types/communication";

const MAX_HOURS = 2160;

/** The SLA rules behind Today: switch each one on or off and say how long is too long. */
export function CommunicationRulesCard({ initial, error }: { initial: CommunicationRuleSetting[] | null; error?: string }) {
  const [rules, setRules] = useState(initial ?? []);
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-sm font-medium text-stone">
        <TimerReset aria-hidden className="size-4" /> Communication rules
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-stone">
        When a rule&apos;s time is up, the candidate shows on Today with a draft ready. Nothing is ever sent without your
        approval.
      </p>
      {initial === null ? (
        <p className="mt-4 text-sm text-danger">{error ?? "Couldn't load the rules."}</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {rules.map((rule) => (
            <RuleRow
              key={rule.key}
              rule={rule}
              onSaved={(saved) => setRules((current) => current.map((item) => (item.key === saved.key ? saved : item)))}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function RuleRow({ rule, onSaved }: { rule: CommunicationRuleSetting; onSaved: (rule: CommunicationRuleSetting) => void }) {
  const id = useId();
  const toast = useToast();
  const [enabled, setEnabled] = useState(rule.enabled);
  const [hours, setHours] = useState(String(rule.thresholdHours));
  const [saving, setSaving] = useState(false);
  const parsed = Number(hours);
  const valid = hours.trim() !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_HOURS;
  const changed = enabled !== rule.enabled || parsed !== rule.thresholdHours;

  async function save() {
    if (!valid || !changed) return;
    setSaving(true);
    try {
      const saved = await updateCommunicationRule(rule.key, enabled, parsed);
      onSaved(saved);
      toast({ title: `${saved.title}: saved`, tone: "success" });
    } catch (caught) {
      toast({ title: "Not saved", description: errorMessage(caught, "Try again in a moment."), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Checkbox
          id={`${id}-enabled`}
          checked={enabled}
          onCheckedChange={(value) => setEnabled(value === true)}
          className="mt-0.5"
          aria-describedby={`${id}-description`}
        />
        <div className="min-w-0">
          <label htmlFor={`${id}-enabled`} className="text-sm font-medium text-ink">
            {rule.title}
          </label>
          <p id={`${id}-description`} className="mt-0.5 text-[13px] text-stone">
            {rule.description}
          </p>
        </div>
      </div>
      <form
        className="flex flex-wrap items-center gap-2 pl-7 sm:pl-0"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label htmlFor={`${id}-hours`} className="sr-only">
          {rule.title}: {rule.unit}
        </label>
        <Input
          id={`${id}-hours`}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_HOURS}
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          disabled={!enabled}
          aria-invalid={!valid}
          className="w-20 tabular-nums"
        />
        <span className="max-w-44 text-xs text-stone">
          {rule.unit}
          {rule.thresholdHours !== rule.defaultHours && <span className="block text-faint">Default {rule.defaultHours}</span>}
        </span>
        <Button type="submit" size="sm" variant="secondary" disabled={!changed || !valid || saving}>
          {saving && <LoaderCircle className="animate-spin" />} Save
        </Button>
      </form>
    </li>
  );
}
