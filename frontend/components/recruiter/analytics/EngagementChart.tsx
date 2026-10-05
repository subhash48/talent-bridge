"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { cn } from "@/lib/utils";
import type { EngagementPoint } from "@/types/analytics";

// Two series on one axis (both are counts of the same visits): total visits in warm ivory with a faint
// wash beneath it, unique candidates in one restrained clay accent. The wash and a legend carry identity
// as well as colour; a crosshair reads both values at any date, and the table holds every number.
const IVORY = "#e8e4d3";
const CLAY = "#c98f5a";
const HEIGHT = 224;
const PAD = { top: 14, right: 14, bottom: 26, left: 38 };

export const SERIES = [
  { key: "visits", label: "Total visits", color: IVORY },
  { key: "unique_candidates", label: "Unique candidates", color: CLAY },
] as const;

export function EngagementChart({ points, dimmed }: { points: EngagementPoint[]; dimmed?: boolean }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const descriptionId = useId();

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const count = points.length;
  const plotWidth = Math.max(width - PAD.left - PAD.right, 1);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const ticks = niceTicks(Math.max(1, ...points.map((point) => point.visits)));
  const top = ticks[ticks.length - 1];
  const x = (index: number) => PAD.left + (count === 1 ? plotWidth / 2 : (index * plotWidth) / (count - 1));
  const y = (value: number) => PAD.top + plotHeight - (value / top) * plotHeight;
  const line = (key: (typeof SERIES)[number]["key"]) =>
    points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(point[key]).toFixed(1)}`).join("");
  const area = count > 1 ? `${line("visits")}L${x(count - 1)} ${y(0)}L${x(0)} ${y(0)}Z` : "";
  const labelled = labelIndexes(count, width);
  const shown = active ?? null;

  function pick(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const position = event.clientX - box.left - PAD.left;
    const index = count === 1 ? 0 : Math.round((position / plotWidth) * (count - 1));
    setActive(Math.min(count - 1, Math.max(0, index)));
  }

  function step(event: KeyboardEvent<SVGSVGElement>) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -count, End: count };
    if (!(event.key in moves)) return;
    event.preventDefault();
    setActive((current) => Math.min(count - 1, Math.max(0, (current ?? count - 1) + moves[event.key])));
  }

  const point = shown !== null ? points[shown] : null;
  const tooltipLeft = shown !== null ? Math.min(Math.max(x(shown) - 80, 0), Math.max(width - 160, 0)) : 0;

  return (
    <div ref={wrapper} className={cn("relative transition-opacity duration-200", dimmed && "opacity-50")}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Portal engagement, ${count} ${count === 1 ? "point" : "points"}. Use the arrow keys to read each one.`}
          aria-describedby={descriptionId}
          tabIndex={0}
          className="block touch-pan-y rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-4"
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((current) => current ?? count - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={step}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="rgb(232 228 211 / 0.08)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-faint text-[10px] tabular-nums">
                {tick.toLocaleString()}
              </text>
            </g>
          ))}
          {labelled.map((index) => (
            <text
              key={index}
              x={x(index)}
              y={HEIGHT - 8}
              textAnchor={count === 1 ? "middle" : index === 0 ? "start" : index === count - 1 ? "end" : "middle"}
              className="fill-faint text-[10px]"
            >
              {points[index].label}
            </text>
          ))}
          {area && <path d={area} fill={IVORY} opacity={0.08} />}
          {count > 1 &&
            SERIES.map((series) => (
              <path
                key={series.key}
                d={line(series.key)}
                fill="none"
                stroke={series.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          {shown !== null && (
            <line x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={PAD.top + plotHeight} stroke="rgb(232 228 211 / 0.28)" strokeWidth={1} />
          )}
          {SERIES.map((series) => {
            const index = shown ?? count - 1;
            if (index < 0) return null;
            return (
              <circle
                key={series.key}
                cx={x(index)}
                cy={y(points[index][series.key])}
                r={4}
                fill={series.color}
                stroke="#031211"
                strokeWidth={2}
              />
            );
          })}
        </svg>
      )}
      {point && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 w-40 animate-fade-in rounded-[10px] border border-border-strong bg-overlay/95 px-3 py-2 text-xs shadow-raised"
          style={{ left: tooltipLeft }}
        >
          <p className="text-faint">{point.label}</p>
          {SERIES.map((series) => (
            <p key={series.key} className="mt-1 flex items-center gap-2">
              <span aria-hidden className="h-[2px] w-3 rounded-full" style={{ backgroundColor: series.color }} />
              <span className="font-semibold text-ink tabular-nums">{point[series.key].toLocaleString()}</span>
              <span className="text-stone">{series.label.toLowerCase()}</span>
            </p>
          ))}
        </div>
      )}
      <p id={descriptionId} className="sr-only">
        Total visits and unique candidates for each period. The table below lists every value.
      </p>
      {width === 0 && <div style={{ height: HEIGHT }} />}
    </div>
  );
}

/** The legend: a short line in each series' colour beside its name. */
export function EngagementLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone" aria-label="Legend">
      {SERIES.map((series) => (
        <li key={series.key} className="flex items-center gap-1.5">
          <span aria-hidden className="h-[2px] w-3.5 rounded-full" style={{ backgroundColor: series.color }} />
          {series.label}
        </li>
      ))}
    </ul>
  );
}

/** Every value, for reading without the chart. */
export function EngagementTable({ points }: { points: EngagementPoint[] }) {
  return (
    <details className="group mt-3 text-xs">
      <summary className="w-fit cursor-pointer list-none rounded-[6px] px-1 py-0.5 text-stone transition-colors hover:text-ink">
        <span className="group-open:hidden">Show as table</span>
        <span className="hidden group-open:inline">Hide table</span>
      </summary>
      <div className="mt-2 max-h-56 overflow-auto rounded-[8px] border border-border">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-surface text-faint">
            <tr>
              <th scope="col" className="px-3 py-1.5 font-medium">
                Period
              </th>
              {SERIES.map((series) => (
                <th key={series.key} scope="col" className="px-3 py-1.5 text-right font-medium">
                  {series.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-charcoal tabular-nums">
            {points.map((point) => (
              <tr key={point.start} className="border-t border-border">
                <th scope="row" className="px-3 py-1.5 font-normal">
                  {point.label}
                </th>
                <td className="px-3 py-1.5 text-right">{point.visits.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right">{point.unique_candidates.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Round, evenly spaced gridline values from 0 to at least max: 0, 5, 10, 15. */
function niceTicks(max: number): number[] {
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough) ?? rough;
  const whole = Math.max(1, Math.ceil(step));
  return Array.from({ length: Math.ceil(max / whole) + 1 }, (_, index) => index * whole);
}

/** Which points get an x-axis label: about one per 90px, always the first and the last. */
function labelIndexes(count: number, width: number): number[] {
  if (count === 0) return [];
  if (count === 1) return [0];
  const slots = Math.max(2, Math.min(count, Math.floor(width / 90)));
  const indexes = Array.from({ length: slots }, (_, slot) => Math.round((slot * (count - 1)) / (slots - 1)));
  return [...new Set(indexes)];
}
