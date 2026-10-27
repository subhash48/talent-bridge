import {
  FRAME_COUNT,
  coverRect,
  framePosition,
  frameSetFor,
  frameUrl,
  framesNear,
  type FrameSet,
} from "@/lib/scroll-frames";

/*
 * Loads and draws the hero's frames on one canvas. Memory stays bounded however long the film:
 *  - the compressed files (about 110 KB each on desktop, 38 KB on phones) are fetched nearest first, the
 *    first few at once and the rest only after the visitor starts scrolling, a few at a time;
 *  - only the frames around the one on screen are decoded (ImageBitmap, off the main thread), and frames
 *    further away are released again, so a handful of bitmaps exist at any moment, not forty.
 */

const FIRST_FRAMES = 6; // fetched straight away, before any scrolling
const PARALLEL_FETCHES = 4;
const DECODE_AHEAD = 3; // decoded around the frame on screen…
const DECODE_BEHIND = 1;
const KEEP = 5; // …and released once further away than this
const MAX_PIXEL_RATIO = 2;

type Slot = { blob?: Blob; fetching?: boolean; failed?: boolean; bitmap?: ImageBitmap; decoding?: boolean };

export class Film {
  private readonly context: CanvasRenderingContext2D;
  private set: FrameSet = "desktop";
  private slots: Slot[] = [];
  private controller = new AbortController();
  private fetching = 0;
  private current = 0;
  private incoming: number | null = null; // the next shot's first frame, while it dissolves in
  private everything = false;
  private disposed = false;

  /** Called when a frame the film needs has become drawable, so the page can draw again. */
  onReady: () => void = () => {};

  constructor(private readonly canvas: HTMLCanvasElement) {
    // Transparent where nothing is drawn yet (a resize, a switch of frame set): the still picture under the
    // canvas shows there instead of black.
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D isn't available");
    this.context = context;
    this.resize();
  }

  /** Matches the canvas to its box (at up to 2× pixel density) and picks the frames for its shape. */
  resize(): void {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const bufferWidth = Math.round(width * ratio);
    const bufferHeight = Math.round(height * ratio);
    if (this.canvas.width !== bufferWidth) this.canvas.width = bufferWidth;
    if (this.canvas.height !== bufferHeight) this.canvas.height = bufferHeight;
    const set = frameSetFor(width, height);
    if (set !== this.set || this.slots.length === 0) this.useSet(set);
  }

  /** From now on fetch every frame (nearest first), not only the first few: the visitor has started scrolling. */
  loadAll(): void {
    if (this.everything) return;
    this.everything = true;
    this.fetchMore();
  }

  /**
   * Draws the clip at this position (0–1), zoomed by `zoom`, blending the two neighbouring frames so forty frames
   * still move smoothly. With `next`, the next shot's frame dissolves in over it by `next.mix`. False if no frame
   * is ready yet.
   */
  draw(position: number, zoom = 1, next: { position: number; zoom: number; mix: number } | null = null): boolean {
    const { index, next: neighbour, mix } = framePosition(position);
    const incoming = next && next.mix > 0.01 ? framePosition(next.position).index : null;
    this.focus(index, incoming);
    const base = this.nearestBitmap(index, FRAME_COUNT);
    if (!base) return false;
    this.context.globalAlpha = 1;
    this.paint(base, zoom);
    const blend = this.slots[neighbour]?.bitmap;
    if (blend && neighbour !== index && mix > 0.02 && base === this.slots[index]?.bitmap) {
      this.context.globalAlpha = mix;
      this.paint(blend, zoom);
    }
    // The cut to the next shot: only with a frame close to the one it asks for, never a stand-in from far away.
    const cut = next && incoming !== null ? this.nearestBitmap(incoming, 3) : undefined;
    if (next && cut) {
      this.context.globalAlpha = next.mix;
      this.paint(cut, next.zoom);
    }
    this.context.globalAlpha = 1;
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.controller.abort();
    this.slots.forEach((slot) => slot.bitmap?.close());
    this.slots = [];
  }

  private useSet(set: FrameSet): void {
    this.controller.abort();
    this.slots.forEach((slot) => slot.bitmap?.close());
    this.set = set;
    this.controller = new AbortController();
    this.fetching = 0;
    this.slots = Array.from({ length: FRAME_COUNT }, () => ({}));
    this.fetchMore();
  }

  private paint(bitmap: ImageBitmap, zoom: number): void {
    const rect = coverRect(bitmap, this.canvas, zoom);
    // Bilinear: the frames are soft photographs, and a cheaper resample keeps scrubbing smooth on phones.
    this.context.imageSmoothingQuality = "medium";
    this.context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height);
  }

  private focus(index: number, incoming: number | null): void {
    const settled = this.slots[index]?.bitmap && (incoming === null || this.slots[incoming]?.bitmap);
    if (index === this.current && incoming === this.incoming && settled) return;
    this.current = index;
    this.incoming = incoming;
    this.fetchMore();
    this.decodeAround();
  }

  /** Whether a frame is near enough to one being shown (or dissolving in) to be worth keeping decoded. */
  private near(index: number, distance: number): boolean {
    return Math.abs(index - this.current) <= distance || (this.incoming !== null && Math.abs(index - this.incoming) <= distance);
  }

  /** The decoded frame closest to `index` within `reach`, so a fast scroll shows the nearest frame rather than nothing. */
  private nearestBitmap(index: number, reach: number): ImageBitmap | undefined {
    for (const candidate of framesNear(index, reach)) {
      const bitmap = this.slots[candidate]?.bitmap;
      if (bitmap) return bitmap;
    }
    return undefined;
  }

  private fetchMore(): void {
    const wanted = this.everything
      ? [...(this.incoming === null ? [] : framesNear(this.incoming, 2)), ...framesNear(this.current, FRAME_COUNT)]
      : framesNear(0, FIRST_FRAMES - 1);
    for (const index of wanted) {
      if (this.fetching >= PARALLEL_FETCHES) return;
      const slot = this.slots[index];
      if (slot && !slot.blob && !slot.fetching && !slot.failed) void this.fetchFrame(index, slot);
    }
  }

  private async fetchFrame(index: number, slot: Slot): Promise<void> {
    const { signal } = this.controller;
    slot.fetching = true;
    this.fetching += 1;
    try {
      const response = await fetch(frameUrl(this.set, index), { signal });
      if (!response.ok) throw new Error(`Frame ${index + 1}: HTTP ${response.status}`);
      slot.blob = await response.blob();
    } catch {
      // Aborted because the set changed (the new set starts afresh), or failed: then the film skips this
      // frame and shows its neighbours, rather than asking for it again and again.
      if (!signal.aborted) slot.failed = true;
    } finally {
      if (!signal.aborted) {
        slot.fetching = false;
        this.fetching -= 1;
        this.decodeAround();
        this.fetchMore();
      }
    }
  }

  private decodeAround(): void {
    const wanted = (index: number, centre: number | null) =>
      centre !== null && index >= centre - DECODE_BEHIND && index <= centre + DECODE_AHEAD;
    this.slots.forEach((slot, index) => {
      if (slot.bitmap && !this.near(index, KEEP)) {
        slot.bitmap.close();
        slot.bitmap = undefined;
      }
      if (!(wanted(index, this.current) || wanted(index, this.incoming)) || !slot.blob || slot.bitmap || slot.decoding) return;
      slot.decoding = true;
      const slots = this.slots;
      createImageBitmap(slot.blob)
        .then((bitmap) => {
          // Too late: the film moved on, switched frame sets or was taken down meanwhile.
          if (this.disposed || slots !== this.slots || !this.near(index, KEEP)) bitmap.close();
          else {
            slot.bitmap = bitmap;
            this.onReady();
          }
        })
        .catch(() => undefined)
        .finally(() => {
          slot.decoding = false;
        });
    });
  }
}
