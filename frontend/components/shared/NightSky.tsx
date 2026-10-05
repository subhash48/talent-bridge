import { cn } from "@/lib/utils";

// The product's backdrop: a still night sky of sparse dots, a few of them joined by faint lines. The
// sign-in page shows it in full; the recruiter workspace and the candidate portal show the same sky,
// fainter and fixed behind the page, so signing in doesn't change the scenery.
// It is one SVG in the page's ink colour, scaled to cover its box. Decoration only: it sits behind
// the page, takes no clicks and is hidden from screen readers.

const WIDTH = 1600;
const HEIGHT = 1000;

type Point = readonly [x: number, y: number];

/** Dots joined by a line. They keep to the sides, with two short ones above and below the card for narrow screens. */
const CONSTELLATIONS: readonly (readonly Point[])[] = [
  [[90, 102], [174, 147], [165, 203]],
  [[104, 469], [155, 588], [214, 545]],
  [[372, 307], [432, 381]],
  [[340, 716], [397, 676]],
  [[115, 857], [196, 904]],
  [[1221, 173], [1297, 119]],
  [[1296, 316], [1387, 376]],
  [[1175, 593], [1226, 505]],
  [[1435, 627], [1459, 706]],
  [[1284, 808], [1362, 876]],
  [[648, 62], [716, 96]],
  [[884, 946], [958, 918]],
];

// The rest of the sky: the same evenly scattered dots on every visit, most of them faint.
const SCATTERED = Array.from({ length: 96 }, (_, index): Point => {
  const n = index + 1;
  return [Math.round(((n * 0.7548776662) % 1) * WIDTH), Math.round(((n * 0.569840291) % 1) * HEIGHT)];
});
const FAINT = SCATTERED.filter((_, index) => index % 3 !== 0);
const SOFT = SCATTERED.filter((_, index) => index % 3 === 0);

const LINES = CONSTELLATIONS.map((points) => `M${points.map(([x, y]) => `${x} ${y}`).join("L")}`).join("");
/** Each dot is a stroke with no length and round ends, so it stays the same size however the sky is scaled. */
const dots = (points: readonly Point[]) => points.map(([x, y]) => `M${x} ${y}h.01`).join("");

/** className positions and dims it, e.g. "fixed opacity-50" behind a portal. By default it fills its parent. */
export function NightSky({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      className={cn("pointer-events-none absolute inset-0 -z-10 size-full text-ink", className)}
    >
      <path d={LINES} strokeWidth={1} opacity={0.16} vectorEffect="non-scaling-stroke" />
      <path d={dots(FAINT)} strokeWidth={1.5} opacity={0.34} vectorEffect="non-scaling-stroke" />
      <path d={dots(SOFT)} strokeWidth={2} opacity={0.55} vectorEffect="non-scaling-stroke" />
      <path d={dots(CONSTELLATIONS.flat())} strokeWidth={2.5} opacity={0.8} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
