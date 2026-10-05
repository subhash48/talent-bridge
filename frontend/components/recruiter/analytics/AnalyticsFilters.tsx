"use client";

import { CalendarRange } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import type { AnalyticsRange, RangePreset } from "@/types/analytics";

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: "Today",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  this_year: "This year",
  custom: "Custom",
};

/** The page's one date filter: every section below it reads the same range. */
export function DateRangeFilter({ value, onChange }: { value: AnalyticsRange; onChange: (range: AnalyticsRange) => void }) {
  const id = useId();
  const [custom, setCustom] = useState(value.preset === "custom");
  const [start, setStart] = useState(value.start ?? "");
  const [end, setEnd] = useState(value.end ?? "");
  const invalid = Boolean(start && end && start > end);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`${id}-range`} className="sr-only">
        Date range
      </label>
      <div className="relative">
        <CalendarRange aria-hidden className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-stone" />
        <Select
          id={`${id}-range`}
          value={custom ? "custom" : value.preset}
          onChange={(event) => {
            const preset = event.target.value as RangePreset;
            setCustom(preset === "custom");
            if (preset !== "custom") onChange({ preset });
          }}
          className="h-9 w-[168px] pl-9"
        >
          {(Object.keys(PRESET_LABELS) as RangePreset[]).map((preset) => (
            <option key={preset} value={preset}>
              {PRESET_LABELS[preset]}
            </option>
          ))}
        </Select>
      </div>
      {custom && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (start && end && !invalid) onChange({ preset: "custom", start, end });
          }}
        >
          <label htmlFor={`${id}-start`} className="sr-only">
            From
          </label>
          <Input id={`${id}-start`} type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} className="w-[150px] [color-scheme:dark]" />
          <span aria-hidden className="text-faint">
            –
          </span>
          <label htmlFor={`${id}-end`} className="sr-only">
            To
          </label>
          <Input
            id={`${id}-end`}
            type="date"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(e.target.value)}
            aria-invalid={invalid || undefined}
            className="w-[150px] [color-scheme:dark]"
          />
          <Button type="submit" variant="secondary" disabled={!start || !end || invalid}>
            Apply
          </Button>
        </form>
      )}
    </div>
  );
}

/** A small set of options as one pill row, e.g. Day / Week / Month / Year. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[8px] border border-border bg-ink/[0.03] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-7 rounded-[6px] px-2.5 text-xs text-stone transition-[background-color,color] duration-150 hover:text-ink",
            value === option.value && "bg-ink/[0.1] font-medium text-ink ring-1 ring-ink/15",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
