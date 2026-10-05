// Career Run: the small dinosaur runner behind the candidate dashboard's greeting
// (components/candidate/CareerRunGreeting.tsx). This is the game itself: its rules, its drawing and
// its clock. Everything stays in the browser. The best score lives in localStorage, shared by
// whoever uses this browser, and nothing here is sent to the API.
//
// The playfield is measured in units: the ground is at GROUND, the dinosaur stands near the left and
// hurdles run towards it. The component says where the playfield sits in the canvas, and the band it
// gets decides how many pixels a unit is, so the same rules play on a wide dashboard and on a phone.

export type RunState = "ready" | "running" | "paused" | "over";

/** What the page shows beside the canvas. A new object each time something in it changes. */
export type RunSnapshot = { state: RunState; score: number; best: number };

/** The canvas in CSS pixels: its size, and the band the playfield uses (ground is the track's line). */
export type RunLayout = { width: number; height: number; top: number; ground: number };

type Hurdle = { x: number; w: number; h: number; label: string };

/** Runs of filled cells: where each starts, its row, and how many cells long it is. */
type Sprite = readonly (readonly [x: number, y: number, length: number])[];

export const READY: RunSnapshot = { state: "ready", score: 0, best: 0 };

const HURDLES = ["Application", "Job", "Interview", "Offer", "Rejection"] as const;
const BEST_KEY = "career-run-best";

const GROUND = 232;
const GRAVITY = 1500;
const JUMP = 550;
/** What the band above the ground must fit: a jump, the dinosaur, and the name it wears (in pixels). */
const JUMP_HEIGHT = JUMP ** 2 / (2 * GRAVITY);
const DINO_HEIGHT = 46;
const NAME_ROOM = 36;

/** Hurdles already on the track before a run starts: where the first stands, and the gap between them. */
const FIRST_HURDLE = 430;
const HURDLE_GAP = 330;

function sprite(rows: string[]): Sprite {
  return rows.flatMap((row, y) => Array.from(row.matchAll(/#+/g), (run) => [run.index, y, run[0].length] as const));
}

// The dinosaur, two units to a cell, facing the hurdles. Its legs have three poses.
const BODY = [
  "............########..",
  "...........##########.",
  "...........##.#######.",
  "...........##########.",
  "...........##########.",
  "...........##########.",
  "...........#####......",
  "...........########...",
  "#.........#####.......",
  "#........######.......",
  "##......#########.....",
  "###....########.#.....",
  "####..#########.......",
  "###############.......",
  ".##############.......",
  "..############........",
  "...###########........",
  "....#########.........",
  ".....#######..........",
];
const DINO = {
  standing: sprite([...BODY, "......###.###.........", "......##...##.........", "......#....#..........", "......##...##........."]),
  left: sprite([...BODY, "......###.###.........", ".......##..##.........", "...........#..........", "...........##........."]),
  right: sprite([...BODY, "......###.###.........", "......##...##.........", "......#...............", "......##.............."]),
};
const DINO_X = 88;
const CLOUD = sprite([
  "........######..........",
  "......##......###.......",
  "..####...........###....",
  ".#..................##..",
  "########################",
]);

export class CareerRun {
  private state: RunState = "ready";
  private y = 0;
  private vy = 0;
  private elapsed = 0;
  private next = 1.4;
  private serial = 0;
  private hurdles: Hurdle[] = [];
  private best = 0;
  private name = "Candidate";

  private canvas: HTMLCanvasElement | null = null;
  private layout: RunLayout = { width: 0, height: 0, top: 0, ground: 0 };
  private scale = 1;
  private width = 800;
  private font = "sans-serif";
  private colors = { ink: "#e8e4d3", charcoal: "rgb(232 228 211 / 0.85)", stone: "rgb(232 228 211 / 0.7)" };

  private frame = 0;
  private last = 0;
  private snapshot = READY;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  /** Start drawing on a canvas. Its typeface and the portal's colour tokens are read from it. */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    const style = getComputedStyle(canvas);
    this.font = style.fontFamily || this.font;
    const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    this.colors = {
      ink: token("--color-ink", this.colors.ink),
      charcoal: token("--color-charcoal", this.colors.charcoal),
      stone: token("--color-stone", this.colors.stone),
    };
    this.best = this.storedBest();
    this.publish();
  }

  detach(): void {
    window.cancelAnimationFrame(this.frame);
    this.canvas = null;
  }

  /** The name the dinosaur wears. */
  setName(name: string): void {
    this.name = Array.from(name.trim()).slice(0, 40).join("") || "Candidate";
    this.draw();
  }

  /** Fit the playfield to the canvas. A run that hasn't started is laid out again for the new width. */
  resize(layout: RunLayout): void {
    const canvas = this.canvas;
    if (!canvas || layout.width <= 0 || layout.height <= 0) return;
    this.layout = layout;
    this.scale = Math.max(0.5, (layout.ground - layout.top - NAME_ROOM) / (JUMP_HEIGHT + DINO_HEIGHT));
    this.width = layout.width / this.scale;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(layout.width * ratio);
    canvas.height = Math.round(layout.height * ratio);
    if (this.state === "ready") this.seed();
    this.draw();
  }

  /** Space, Arrow Up, a click or a tap: start, jump, carry on after a pause, or try again. */
  press(): void {
    if (this.state === "over") this.reset();
    if (this.state === "paused") {
      this.togglePause();
      return;
    }
    if (this.state === "ready") this.run();
    if (this.y === 0) this.vy = JUMP;
  }

  /** Jump, only if a run is under way. */
  jump(): void {
    if (this.state === "running" && this.y === 0) this.vy = JUMP;
  }

  togglePause(): void {
    if (this.state === "running") this.pause();
    else if (this.state === "paused") this.run();
  }

  pause(): void {
    if (this.state !== "running") return;
    this.state = "paused";
    window.cancelAnimationFrame(this.frame);
    this.draw();
    this.publish();
  }

  /** Back to a fresh run, waiting to start. */
  reset(): void {
    window.cancelAnimationFrame(this.frame);
    this.state = "ready";
    this.y = this.vy = this.elapsed = 0;
    this.seed();
    this.draw();
    this.publish();
  }

  /** Paint the game as it stands. */
  draw(): void {
    const canvas = this.canvas;
    const ctx = canvas?.getContext("2d");
    const { width, height, top, ground } = this.layout;
    if (!canvas || !ctx || width <= 0) return;
    const ratio = canvas.width / width;
    const { scale } = this;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.drawSky(ctx, width, top, ground);

    // From here on, in playfield units.
    ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, ratio * (ground - GROUND * scale));
    // The ground runs edge to edge, so the track is exactly as wide as the cards under it.
    ctx.fillStyle = this.colors.charcoal;
    ctx.fillRect(0, GROUND, this.width, 1.5 / scale);
    ctx.globalAlpha = 0.45;
    for (let i = 0; i * 61 < this.width + 50; i++) {
      let x = (i * 61 - this.elapsed * 100) % (this.width + 50);
      if (x < 0) x += this.width + 50;
      if (x < this.width - 8) ctx.fillRect(x, GROUND + 5 + (i % 3) * 2.5, 3 + (i % 3) * 2, 1.5);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = "center";
    ctx.font = `${12.5 / scale}px ${this.font}`;
    for (const hurdle of this.hurdles) {
      this.drawCactus(ctx, hurdle);
      ctx.fillText(hurdle.label, hurdle.x + hurdle.w / 2, GROUND - 2 - hurdle.h - 11 / scale);
    }

    // The dinosaur goes on last, so a hurdle's label never prints across it.
    const dinoTop = GROUND - 1 - DINO_HEIGHT - this.y;
    const stride = Math.floor(this.elapsed * 12) % 2 ? DINO.left : DINO.right;
    ctx.fillStyle = this.colors.ink;
    this.drawSprite(ctx, this.state === "running" && this.y === 0 ? stride : DINO.standing, DINO_X, dinoTop, 2, 0.25);
    ctx.font = `600 ${13 / scale}px ${this.font}`;
    ctx.fillText(this.name, DINO_X + 21, dinoTop - 11 / scale, 180);
  }

  private run(): void {
    this.state = "running";
    this.last = 0;
    window.cancelAnimationFrame(this.frame);
    this.frame = window.requestAnimationFrame(this.loop);
    this.publish();
  }

  // The clock only runs during a run: a waiting, paused or finished game costs nothing.
  private loop = (time: number) => {
    const dt = this.last ? Math.min((time - this.last) / 1000, 0.035) : 0;
    this.last = time;
    this.tick(dt);
    this.draw();
    this.publish();
    if (this.state === "running") this.frame = window.requestAnimationFrame(this.loop);
  };

  private tick(dt: number): void {
    this.elapsed += dt;
    const speed = Math.min(360, 220 + this.elapsed * 2);
    this.y += this.vy * dt;
    this.vy -= GRAVITY * dt;
    if (this.y < 0) {
      this.y = 0;
      this.vy = 0;
    }
    this.next -= dt;
    if (this.next <= 0) {
      this.hurdles.push(this.hurdle(this.width + 20));
      this.next = 1.5 + Math.random() * 0.5;
    }
    for (const hurdle of this.hurdles) {
      hurdle.x -= speed * dt;
      if (91 < hurdle.x + hurdle.w && 125 > hurdle.x && 228 - this.y > 230 - hurdle.h && 185 - this.y < 230) this.end();
    }
    this.hurdles = this.hurdles.filter((hurdle) => hurdle.x > -140);
  }

  private end(): void {
    this.state = "over";
    // Read again first: another tab may have set a higher best since this one loaded.
    this.best = Math.max(this.best, this.storedBest(), this.score());
    try {
      window.localStorage.setItem(BEST_KEY, String(this.best));
    } catch {
      // Not stored: the best score lasts for this visit only.
    }
  }

  private score(): number {
    return Math.floor(this.elapsed * 10);
  }

  /** The best score kept in this browser: 0 if there is none, it can't be read, or it isn't a score. */
  private storedBest(): number {
    try {
      const stored = Number(window.localStorage.getItem(BEST_KEY));
      return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
    } catch {
      return 0;
    }
  }

  private hurdle(x: number): Hurdle {
    return { x, w: 24, h: 30 + (this.serial % 3) * 8, label: HURDLES[this.serial++ % HURDLES.length] };
  }

  /**
   * Put the first hurdles on the track, so a waiting game already shows what's ahead. Only those whose
   * label fits are placed: on a narrow track the first hurdle arrives from the edge instead.
   */
  private seed(): void {
    this.serial = 0;
    this.hurdles = [];
    const fits = (x: number) => x + 12 + (HURDLES[this.serial % HURDLES.length].length * 3 + 6) / this.scale <= this.width;
    for (let x = FIRST_HURDLE; fits(x); x += HURDLE_GAP) this.hurdles.push(this.hurdle(x));
    const last = this.hurdles[this.hurdles.length - 1];
    this.next = last ? Math.max(0, last.x + HURDLE_GAP - (this.width + 20)) / 220 : 1.4;
  }

  private publish(): void {
    const { state, best } = this;
    const score = this.score();
    if (state === this.snapshot.state && score === this.snapshot.score && best === this.snapshot.best) return;
    this.snapshot = { state, score, best };
    this.listeners.forEach((listener) => listener());
  }

  /** A hurdle as a cactus. Its trunk and arms fill the hurdle's box, so what you see is what you hit. */
  private drawCactus(ctx: CanvasRenderingContext2D, { x, w, h }: Hurdle): void {
    const top = GROUND - 2 - h;
    const leftTop = top + Math.round(h * 0.38);
    const leftHeight = Math.round(h * 0.3);
    const rightTop = top + Math.round(h * 0.2);
    const rightHeight = Math.round(h * 0.33);
    ctx.fillRect(x + 10, top, 4, 2);
    ctx.fillRect(x + 8, top + 2, 8, h);
    ctx.fillRect(x, leftTop, 5, leftHeight);
    ctx.fillRect(x, leftTop + leftHeight - 5, 8, 5);
    ctx.fillRect(x + w - 5, rightTop, 5, rightHeight);
    ctx.fillRect(x + w - 8, rightTop + rightHeight - 5, 8, 5);
  }

  /**
   * A moon and a few clouds, in CSS pixels, kept clear of the greeting's text. The stars are the page's
   * own night sky, which shows through the canvas: the game has no sky of its own to stand apart.
   */
  private drawSky(ctx: CanvasRenderingContext2D, width: number, top: number, ground: number): void {
    // On a wide dashboard the moon and two clouds sit up beside the greeting, to the right of its text
    // column (62ch at most). Any narrower and that space can be text, so they stay in the track's band.
    const wide = width >= 920;
    const moon = wide ? { x: width * 0.71, y: Math.max(40, top - 36), r: 13 } : { x: width - 44, y: top + 20, r: 10 };
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, ground);
    ctx.arc(moon.x - moon.r * 0.55, moon.y, moon.r, 0, Math.PI * 2);
    ctx.clip("evenodd");
    ctx.beginPath();
    ctx.arc(moon.x, moon.y, moon.r, 0, Math.PI * 2);
    ctx.fillStyle = this.colors.stone;
    ctx.globalAlpha = 0.4;
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = this.colors.stone;
    ctx.globalAlpha = 0.22;
    const clouds = wide ? [[0.3, 70], [0.58, 4], [0.84, -2]] : [[0.3, 8], [0.62, 26]];
    const span = width + 120;
    for (const [at, down] of clouds) {
      let x = (at * width - this.elapsed * 6) % span;
      if (x < 0) x += span;
      this.drawSprite(ctx, CLOUD, x - 60, top + down, 3, 0);
    }
    ctx.globalAlpha = 1;
  }

  /** A sprite from its runs of cells. A solid sprite's runs overlap a touch, so no seams show between rows. */
  private drawSprite(ctx: CanvasRenderingContext2D, runs: Sprite, x: number, y: number, cell: number, overlap: number): void {
    for (const [column, row, length] of runs) ctx.fillRect(x + column * cell, y + row * cell, length * cell, cell + overlap);
  }
}
