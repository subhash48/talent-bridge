/*
 * The home page's film: 40 frames of a valley, chosen by how far the hero has been scrolled. Pure functions
 * only, so they can be tested without a browser; components/site/hero/film.ts does the loading and drawing.
 */

export const FRAME_COUNT = 40;

/** Landscape screens get the 1920×1080 frames; portrait ones the 9:16 crop of the valley's centre (608×1080). */
export type FrameSet = "desktop" | "mobile";

export function frameUrl(set: FrameSet, index: number): string {
  return `/hero/${set}/${String(index + 1).padStart(2, "0")}.webp`;
}

/** Portrait viewports use the mobile crop, so the river and trees stay in view instead of being cut away. */
export function frameSetFor(width: number, height: number): FrameSet {
  return height > width * 1.05 ? "mobile" : "desktop";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 0 at the top of the hero, 1 once its last screen is reached. */
export function scrollProgress(scrolled: number, scrollable: number): number {
  return scrollable > 0 ? clamp(scrolled / scrollable, 0, 1) : 0;
}

/**
 * Where progress falls in the film: index = floor(progress × (count − 1)), the frame after it, and how far
 * towards that one (0–1), so two neighbouring frames can be blended and 40 frames still move smoothly.
 */
export function framePosition(progress: number, count = FRAME_COUNT): { index: number; next: number; mix: number } {
  const exact = clamp(progress, 0, 1) * (count - 1);
  const index = Math.floor(exact);
  return { index, next: Math.min(index + 1, count - 1), mix: exact - index };
}

/** Every frame within `reach` of `from`, nearest first, ahead before behind at the same distance. */
export function framesNear(from: number, reach: number, count = FRAME_COUNT): number[] {
  const order: number[] = [];
  for (let distance = 0; distance <= reach; distance += 1) {
    for (const index of distance === 0 ? [from] : [from + distance, from - distance]) {
      if (index >= 0 && index < count) order.push(index);
    }
  }
  return order;
}

/** Where to draw an image so it covers the canvas (object-fit: cover), zoomed in about its centre. */
export function coverRect(
  image: { width: number; height: number },
  canvas: { width: number; height: number },
  zoom = 1,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(canvas.width / image.width, canvas.height / image.height) * zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, width, height };
}

/**
 * When a scene shows, as fractions of the film's progress: it fades in from `from` to `full`, holds, and fades
 * out from `fade` to `gone`. The first is already shown at 0; the last stays to the end.
 */
export type SceneWindow = readonly [from: number, full: number, fade: number, gone: number];

/**
 * One window per scene, in turn and never overlapping: each scene gets a share of the film by its weight, fading
 * in over the first `edge` of its share and out over the last. The first starts shown; the last fades out too,
 * so the pinned screen is empty when it lets go and the footer arrives over the bare valley.
 */
export function sceneWindows(weights: readonly number[], edge = 0.22): SceneWindow[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let start = 0;
  return weights.map((weight, index) => {
    const length = weight / total;
    const end = index === weights.length - 1 ? 1 : start + length;
    const window: SceneWindow = [index === 0 ? -1 : start, index === 0 ? 0 : start + length * edge, end - length * edge, end];
    start = end;
    return window;
  });
}

/** Where a scene is fully shown and settled: where a link to it should land. */
export function holdPoint([, full, fade]: SceneWindow): number {
  return (Math.max(full, 0) + fade) / 2;
}

/**
 * Which part of the film plays at this progress. The clip is short, so every scene is its own shot: across a
 * scene's window the clip plays once from its first frame to its last (position 0–1), and while the scene fades
 * out the next shot's first frame dissolves in over it (`next`, with `mix` 0–1), so each cut lands under a change
 * of scene. The last shot holds its last frame once the stage is over.
 */
export function filmShot(
  progress: number,
  windows: readonly SceneWindow[],
): { scene: number; position: number; next: { position: number; mix: number } | null } {
  const at = clamp(progress, 0, 1);
  const scene = Math.max(0, windows.findIndex(([, , , gone], index) => at < gone || index === windows.length - 1));
  const [from, , fade, gone] = windows[scene];
  const start = scene === 0 ? 0 : from;
  const position = clamp((at - start) / (gone - start), 0, 1);
  const leaving = scene < windows.length - 1 && at > fade;
  return { scene, position, next: leaving ? { position: 0, mix: (at - fade) / (gone - fade) } : null };
}

/** How shown a scene is at this progress (0–1), and whether it's leaving (rather than arriving). */
export function sceneState(progress: number, [from, full, fade, gone]: SceneWindow): { shown: number; leaving: boolean } {
  if (progress <= from || progress >= gone) return { shown: 0, leaving: progress >= gone };
  if (progress < full) return { shown: (progress - from) / (full - from), leaving: false };
  if (progress <= fade) return { shown: 1, leaving: false };
  return { shown: (gone - progress) / (gone - fade), leaving: true };
}

/** Moves `current` towards `target`, the same distance per millisecond at any frame rate. */
export function ease(current: number, target: number, elapsedMs: number, halfLifeMs = 70): number {
  return target + (current - target) * Math.pow(0.5, elapsedMs / halfLifeMs);
}
