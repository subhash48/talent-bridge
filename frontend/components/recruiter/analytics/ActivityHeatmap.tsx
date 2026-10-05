"use client";

import { useState } from "react";

import type { ActivityHeatmap as Heatmap } from "@/types/analytics";

// One hue, light to dark: empty hours stay the card's own dark, busier ones take more warm ivory.
const shade = (value: number, max: number) =>
  value === 0 || max === 0 ? "rgb(232 228 211 / 0.035)" : `rgb(232 228 211 / ${(0.12 + 0.78 * (value / max) ** 0.75).toFixed(3)})`;

const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Every other column is labelled: 12a, 4a, 8a, 12p, 4p, 8p. */
const HOUR_LABELS = ["12a", "", "4a", "", "8a", "", "12p", "", "4p", "", "8p", ""];

/** When candidates use the portal: visits started, by weekday and two-hour window, in the recruiter's time. */
export function ActivityHeatmap({ heatmap }: { heatmap: Heatmap }) {
  const [hovered, setHovered] = useState<{ row: number; column: number } | null>(null);
  const reading = hovered ?? null;
  const total = heatmap.values.flat().reduce((sum, value) => sum + value, 0);

  if (total === 0) {
    return <p className="py-6 text-center text-sm text-stone">No portal visits in this period yet.</p>;
  }

  return (
    <div>
      <div aria-hidden className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2" onPointerLeave={() => setHovered(null)}>
        <div />
        <div className="grid grid-cols-12 gap-[3px] pb-1">
          {HOUR_LABELS.map((label, index) => (
            <span key={index} className="text-[10px] text-faint">
              {label}
            </span>
          ))}
        </div>
        {heatmap.rows.map((day, row) => (
          <div key={day} className="contents">
            <span className="flex items-center text-[11px] text-stone">{SHORT_DAYS[row]}</span>
            <div className="grid grid-cols-12 gap-[3px] py-[1.5px]">
              {heatmap.values[row].map((value, column) => (
                <span
                  key={column}
                  title={`${day}, ${heatmap.columns[column]}: ${value} ${value === 1 ? "visit" : "visits"}`}
                  onPointerEnter={() => setHovered({ row, column })}
                  className="aspect-[1.6] min-h-3 rounded-[3px] transition-[box-shadow] duration-150 hover:ring-1 hover:ring-ink/60"
                  style={{ backgroundColor: shade(value, heatmap.max) }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* sr-only on a table itself doesn't shrink it, so the wrapper hides it. */}
      <div className="sr-only">
        <table>
          <caption>Portal visits started by weekday and time of day, in your local time</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              {heatmap.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmap.rows.map((day, row) => (
              <tr key={day}>
                <th scope="row">{day}</th>
                {heatmap.values[row].map((value, column) => (
                  <td key={column}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-faint">
        <p aria-hidden className="min-h-4 text-stone">
          {reading
            ? `${heatmap.rows[reading.row]} · ${heatmap.columns[reading.column]}: ${heatmap.values[reading.row][reading.column]} visits`
            : "Your local time"}
        </p>
        <span className="flex items-center gap-1.5" aria-hidden>
          Fewer
          {[0, 0.25, 0.5, 0.75, 1].map((step) => (
            <span key={step} className="size-2.5 rounded-[2px]" style={{ backgroundColor: shade(step, 1) }} />
          ))}
          More
        </span>
      </div>

      {heatmap.peak && (
        <div className="mt-4 border-t border-border pt-3.5">
          <p className="text-[11px] font-medium tracking-wide text-faint uppercase">Peak activity</p>
          <p className="mt-1 text-[15px] font-medium text-ink">
            {heatmap.peak.day} · {heatmap.peak.window}
          </p>
          <p className="mt-0.5 text-xs text-stone">
            {heatmap.peak.share}% of this period&apos;s portal visits started in this window.
          </p>
        </div>
      )}
    </div>
  );
}
