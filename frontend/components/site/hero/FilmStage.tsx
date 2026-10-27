"use client";

import { ArrowDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Film } from "@/components/site/hero/film";
import { cn } from "@/lib/utils";
import { ease, filmShot, holdPoint, sceneState, sceneWindows, scrollProgress } from "@/lib/scroll-frames";

export type Scene = {
  /** What the scene is, for screen readers. */
  label: string;
  content: ReactNode;
  /** How much of the film it gets, relative to the others. */
  weight: number;
  /** For links into the page, e.g. "product" for /#product. */
  anchor?: string;
  /** A single line between scenes: left out of the still version. */
  statement?: boolean;
};

const PUSH_IN = 0.14; // how far the camera closes in over each shot, on top of the clip's own movement
const SCREENS_PER_WEIGHT = 0.8; // how much scrolling one unit of weight takes, in screens
// A scene not on screen: its words and cards at opacity 0 (through --shown, see .scene-fade) and no clicks.
const HIDDEN = { "--shown": 0, pointerEvents: "none" } as CSSProperties;

/** Data saver on, or a 2G connection: the still picture, not forty frames. */
function prefersLessData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection;
  return Boolean(connection?.saveData) || /2g/.test(connection?.effectiveType ?? "");
}

/**
 * The home page, told inside its film. A valley filmed in 40 frames fills the screen behind everything (a fixed
 * canvas). Over it, one pinned screen shows the scenes in turn, each fading in and out with the scroll, their words
 * in the sky and their pictures over the meadow. The clip is short, so each scene is its own shot: scrolling
 * through a scene plays the clip once while the camera closes in, and the next shot dissolves in as the scene
 * fades out. One requestAnimationFrame loop runs only while the picture is catching up with the scroll.
 *
 * Every scene stays in the page for screen readers; one that isn't on screen takes no clicks, and tabbing into it
 * scrolls the film to it. Reduced motion or data saver: one still frame behind the scenes, laid out one after
 * another like an ordinary page.
 */
export function FilmStage({ scenes }: { scenes: Scene[] }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sceneRefs = useRef<(HTMLElement | null)[]>([]);
  const hint = useRef<HTMLDivElement>(null);
  const [still, setStill] = useState(false);
  const windows = useMemo(() => sceneWindows(scenes.map((scene) => scene.weight)), [scenes]);
  const screens = 1 + SCREENS_PER_WEIGHT * scenes.reduce((sum, scene) => sum + scene.weight, 0);

  useEffect(() => {
    const root = stage.current;
    const surface = canvas.current;
    if (!root || !surface) return;
    if (
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      prefersLessData() ||
      typeof createImageBitmap !== "function"
    ) {
      // A decision only the browser can make, after the page is drawn: the still version instead.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStill(true);
      return;
    }

    let film: Film | null = null;
    let target = 0; // scroll position, in pixels
    let shown = 0; // where the picture is, catching up with it
    let last = 0;
    let frame = 0;
    // Where the stage is and how far it scrolls: measured on load and whenever the page changes size.
    let stageTop = 0;
    let stageScroll = 1;
    // What each scene shows now, as the server drew it: only changes are written, so nothing repaints for nothing.
    const drawn: string[] = windows.map((_, index) => (index === 0 ? "1.000+" : "0.000+"));

    const layout = () => {
      const box = root.getBoundingClientRect();
      stageTop = box.top + window.scrollY;
      stageScroll = Math.max(1, box.height - window.innerHeight);
    };

    const render = (y: number) => {
      const story = scrollProgress(y - stageTop, stageScroll);
      // At the very top the picture already on screen is the first frame, so the canvas only takes over once the
      // film moves: no drawing at all while the page loads.
      if (story > 0 || surface.dataset.ready) {
        const shot = filmShot(story, windows);
        const next = shot.next && { position: shot.next.position, zoom: 1, mix: shot.next.mix };
        if (film?.draw(shot.position, 1 + PUSH_IN * shot.position, next)) surface.dataset.ready = "true";
      }
      windows.forEach((window, index) => {
        const scene = sceneRefs.current[index];
        const { shown: amount, leaving } = sceneState(story, window);
        const state = `${amount.toFixed(3)}${leaving ? "-" : "+"}`;
        if (!scene || state === drawn[index]) return;
        drawn[index] = state;
        scene.style.setProperty("--shown", amount.toFixed(3));
        scene.style.transform = `translate3d(0, ${((1 - amount) * (leaving ? -24 : 24)).toFixed(1)}px, 0)`;
        scene.style.pointerEvents = amount > 0.5 ? "auto" : "none";
      });
      if (hint.current) hint.current.style.opacity = String(Math.max(0, 1 - story * 40));
    };

    const tick = (now: number) => {
      // A link, a key or a tab that moves more than a screen is a jump: land on it, don't sweep every scene between.
      if (Math.abs(target - shown) > window.innerHeight) shown = target;
      else shown = ease(shown, target, last ? Math.min(now - last, 100) : 16);
      if (Math.abs(shown - target) < 0.5) shown = target;
      last = now;
      render(shown);
      frame = shown === target ? 0 : requestAnimationFrame(tick);
      if (!frame) last = 0;
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const resizedCanvas = new ResizeObserver(() => {
      film?.resize();
      render(shown);
    });
    // The film starts once the page is idle (or at the first scroll), so its frames never compete with the
    // page's own first load; until then the first frame is the picture already on screen.
    const start = () => {
      if (film) return;
      film = new Film(surface);
      film.onReady = () => {
        if (!frame) render(shown);
      };
      resizedCanvas.observe(surface);
      if (target > 0) film.loadAll();
      render(shown);
    };
    const resizedPage = new ResizeObserver(() => {
      layout();
      render(shown);
    });
    resizedPage.observe(document.body);

    const onScroll = () => {
      target = window.scrollY;
      start();
      if (target > 0) film?.loadAll();
      wake();
    };
    // Tabbing into a scene that isn't on screen brings the film to it, so focus is never on something invisible.
    const onFocus = (event: FocusEvent) => {
      const scene = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-scene]") : null;
      if (!scene) return;
      const index = Number(scene.dataset.scene);
      if (sceneState(scrollProgress(window.scrollY - stageTop, stageScroll), windows[index]).shown > 0.95) return;
      window.scrollTo({ top: stageTop + holdPoint(windows[index]) * stageScroll });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    root.addEventListener("focusin", onFocus);

    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(start, { timeout: 2500 })
      : window.setTimeout(start, 400);
    // Coming back to the page part-way down: start where the visitor already is, after the first frame is drawn.
    const opening = requestAnimationFrame(() => {
      layout();
      target = shown = window.scrollY;
      if (target > 0) start();
      render(shown);
    });

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(opening);
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      window.removeEventListener("scroll", onScroll);
      root.removeEventListener("focusin", onFocus);
      resizedCanvas.disconnect();
      resizedPage.disconnect();
      film?.dispose();
    };
  }, [windows]);

  // Following a link to a scene (See how it works, the header's Product): once there, focus moves to that scene,
  // so keyboard and screen reader users carry on from it rather than from a link that is now off screen.
  useEffect(() => {
    const onLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href*='#']") : null;
      if (!link) return;
      const url = new URL(link.href);
      const index = scenes.findIndex((scene) => scene.anchor && `#${scene.anchor}` === url.hash);
      if (url.pathname !== window.location.pathname || index < 0) return;
      requestAnimationFrame(() => sceneRefs.current[index]?.focus({ preventScroll: true }));
    };
    document.addEventListener("click", onLink);
    return () => document.removeEventListener("click", onLink);
  }, [scenes]);

  // In the still version a link to a scene lands on its section, which is then where the scene really is.
  useEffect(() => {
    if (!still || !window.location.hash) return;
    document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
  }, [still]);

  // The still version, by the browser's own setting (before any script) or the script's decision (data saver):
  // the scenes one after another, each over its own still of the valley so its words sit on the sky.
  const flat =
    "motion-reduce:relative motion-reduce:still-scene motion-reduce:[--shown:1]! motion-reduce:pointer-events-auto! motion-reduce:transform-none! group-data-[still]/stage:relative group-data-[still]/stage:still-scene group-data-[still]/stage:[--shown:1]! group-data-[still]/stage:pointer-events-auto! group-data-[still]/stage:transform-none!";

  return (
    <>
      {/*
        The film, behind the whole page. Large-viewport tall, so a phone's address bar sliding away never resizes
        the canvas mid-scroll. The first frame shows at once (and stays for the still version); the canvas fades in
        over it once the film moves. The sky is graded towards a soft lavender-grey and peach, like the reference.
      */}
      <div aria-hidden className="fixed inset-x-0 top-0 -z-10 h-lvh overflow-hidden bg-[#c9c6b3]">
        <picture>
          <source media="(max-aspect-ratio: 20/21)" srcSet="/hero/mobile/01.webp" />
          <img
            src="/hero/desktop/01.webp"
            alt=""
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 size-full object-cover"
          />
        </picture>
        <canvas
          ref={canvas}
          className="absolute inset-0 size-full opacity-0 transition-opacity duration-500 data-[ready]:opacity-100"
        />
        <div className="sky-grade pointer-events-none absolute inset-0" />
      </div>

      <div
        ref={stage}
        data-still={still || undefined}
        style={{ height: `${screens * 100}vh` }}
        className="group/stage relative motion-reduce:h-auto! data-[still]:h-auto!"
      >
        {scenes.map((scene, index) =>
          scene.anchor ? (
            // Where /#anchor lands while the film plays: the point of the scroll at which this scene is fully shown.
            <span
              key={scene.anchor}
              id={still ? undefined : scene.anchor}
              aria-hidden
              className="pointer-events-none absolute left-0 h-px w-px scroll-mt-0"
              style={{ top: `calc(${holdPoint(windows[index]).toFixed(4)} * (100% - 100vh))` }}
            />
          ) : null,
        )}
        <div className="sticky top-0 h-svh min-h-[540px] overflow-hidden motion-reduce:static motion-reduce:h-auto motion-reduce:overflow-visible group-data-[still]/stage:static group-data-[still]/stage:h-auto group-data-[still]/stage:overflow-visible">
          {scenes.map((scene, index) => (
            <section
              key={scene.label}
              ref={(element) => {
                sceneRefs.current[index] = element;
              }}
              id={still ? scene.anchor : undefined}
              tabIndex={-1}
              data-scene={index}
              aria-label={scene.label}
              style={still || index === 0 ? undefined : HIDDEN}
              className={cn(
                "absolute inset-0 flex flex-col outline-none motion-reduce:min-h-svh group-data-[still]/stage:min-h-svh",
                flat,
                scene.statement && "motion-reduce:hidden group-data-[still]/stage:hidden",
              )}
            >
              {scene.content}
            </section>
          ))}

          <div
            ref={hint}
            aria-hidden
            className="absolute bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-overlay/60 px-3.5 py-1.5 text-[11px] font-medium tracking-[0.2em] text-charcoal uppercase ring-1 ring-ink/10 backdrop-blur-md motion-reduce:hidden group-data-[still]/stage:hidden"
          >
            Scroll <ArrowDown className="size-3" />
          </div>
        </div>
      </div>
    </>
  );
}
