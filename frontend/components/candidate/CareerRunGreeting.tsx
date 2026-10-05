"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { CareerRun, READY, type RunState } from "@/lib/career-run";
import { cn } from "@/lib/utils";

const HINTS: Record<RunState, string> = {
  ready: "Space or tap to jump",
  running: "Space or tap to jump",
  paused: "Paused. Space or tap to carry on",
  over: "A hurdle, not the end. Try again.",
};

const PLAY_LABELS: Record<RunState, string> = { ready: "Start", running: "Pause", paused: "Resume", over: "Play again" };

type CareerRunGreetingProps = {
  /** "Good morning", by the time of day. */
  greeting: string;
  /** The candidate's first name: the heading, and the name the dinosaur wears. */
  name: string;
  /** One sentence on where the current application stands. */
  status: string;
  /** Shown top right, after the score: the portal's bell and avatar. */
  actions?: ReactNode;
};

/**
 * The dashboard's greeting, set in Career Run: a small dinosaur runner (lib/career-run.ts) played
 * right here. It has no frame of its own, so it reads as part of the page: the greeting, name and
 * status line sit top left, the score, bell and avatar top right, and the track runs underneath, as
 * wide as the cards below it. A click or tap on the track starts a run, and keys are only read while
 * the game has focus.
 *
 * The game is a break, not portal use: its score never leaves the browser, and its input is marked
 * so the portal's activity reporting (lib/engagement.ts) skips it.
 */
export function CareerRunGreeting({ greeting, name, status, actions }: CareerRunGreetingProps) {
  const [game] = useState(() => new CareerRun());
  const { state, score, best } = useSyncExternalStore(game.subscribe, game.getSnapshot, () => READY);
  const area = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const play = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  // A press that already made the dinosaur jump mustn't count again as the click that follows it.
  const jumped = useRef(false);
  // The focus outline is for someone who reached the game with the keyboard. A click or tap focuses it
  // too, and must not draw a frame around it, even once the keys are used to jump.
  const [tabbedTo, setTabbedTo] = useState(false);

  useEffect(() => {
    const box = area.current;
    const surface = play.current;
    const band = track.current;
    if (!box || !surface || !band || !canvas.current) return;
    game.attach(canvas.current);
    const fit = () => game.resize({ width: box.clientWidth, height: box.clientHeight, top: band.offsetTop, ground: band.offsetTop + band.offsetHeight });
    const resized = new ResizeObserver(fit);
    resized.observe(box);
    // The typeface may arrive after the first paint.
    void document.fonts.ready.then(() => game.draw());
    // Zooming, or moving to another screen, changes the pixels behind the game without changing its size.
    let density = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const refit = () => {
      fit();
      density = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      density.addEventListener("change", refit, { once: true });
    };
    density.addEventListener("change", refit, { once: true });

    // A run nobody is watching waits: the tab is hidden, or the game has scrolled out of view. Scrolled
    // away, it also gives up focus, so Space goes back to scrolling the page.
    const hidden = () => document.hidden && game.pause();
    document.addEventListener("visibilitychange", hidden);
    const seen = new IntersectionObserver((entries) => {
      if (entries[entries.length - 1].isIntersecting) return;
      game.pause();
      if (document.activeElement instanceof HTMLElement && surface.contains(document.activeElement)) document.activeElement.blur();
    });
    seen.observe(band);
    return () => {
      resized.disconnect();
      seen.disconnect();
      density.removeEventListener("change", refit);
      document.removeEventListener("visibilitychange", hidden);
      game.detach();
    };
  }, [game]);

  useEffect(() => game.setName(name), [game, name]);

  const onControl = (target: EventTarget) => target instanceof Element && target.closest("button") !== null;
  const focusGame = () => play.current?.focus({ preventScroll: true });
  // A run starts, or carries on, with the whole game in view.
  const start = () => {
    game.press();
    area.current?.scrollIntoView({ block: "nearest" });
  };
  // After a mouse or touch press on a control, focus goes back to the game so the keys keep jumping.
  const handBack = (event: MouseEvent) => {
    if (event.detail) focusGame();
  };

  return (
    <section ref={area} className="relative isolate lg:pt-3">
      {/* The run is drawn behind everything here, straight onto the page and its night sky. */}
      <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 -z-10 size-full" />

      <div className="flex items-start justify-between gap-3">
        {/* Set down a little, so the greeting's line is level with the score's. */}
        <h1 className="min-w-0 pt-1.5">
          <span className="block text-base leading-6 text-stone sm:text-lg sm:leading-6">{greeting},</span>
          <span className="block truncate text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-ink sm:text-[38px]">
            {name}
          </span>
        </h1>
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <p className="relative text-right text-sm text-charcoal tabular-nums sm:text-[15px]">
            Score {score}
            {/* Hung under the score, so nothing moves when a best score first appears. */}
            {best > 0 && <span className="absolute top-full right-0 text-xs whitespace-nowrap text-faint">Best {best}</span>}
          </p>
          {actions}
        </div>
      </div>
      <p className="mt-1 max-w-[62ch] text-sm text-stone">{status}</p>

      <div
        ref={play}
        role="group"
        aria-label="Career Run, a small dinosaur game. Space or Arrow Up jumps, P pauses."
        tabIndex={0}
        data-not-portal-activity
        onPointerDown={(event) => {
          setTabbedTo(false);
          // During a run a jump can't wait for the click; starting one does, so a scroll never starts it.
          jumped.current = state === "running" && event.button === 0 && !onControl(event.target);
          if (jumped.current) game.jump();
        }}
        onClick={(event) => {
          const handled = jumped.current || onControl(event.target);
          jumped.current = false;
          if (handled) return;
          start();
          focusGame();
        }}
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          if (event.code === "Space" || event.code === "ArrowUp") {
            // Space on a focused control presses that control.
            if (event.code === "Space" && onControl(event.target)) return;
            event.preventDefault();
            if (!event.repeat) game.press();
          }
          if (event.key.toLowerCase() === "p" && !event.repeat) game.togglePause();
        }}
        onFocus={(event) => event.target === event.currentTarget && setTabbedTo(event.currentTarget.matches(":focus-visible"))}
        onBlur={(event) => {
          if (event.target === event.currentTarget) setTabbedTo(false);
          // Keys are only read while the game has focus, so a run can't carry on without it.
          if (!event.currentTarget.contains(event.relatedTarget)) game.pause();
        }}
        className={cn(
          "mt-1 touch-manipulation rounded-[10px] select-none",
          tabbedTo ? "outline-2 outline-offset-2 outline-ink/50" : "outline-none",
        )}
      >
        {/* The track's band: the canvas draws the run here, with the ground along its bottom edge. */}
        <div ref={track} aria-hidden className="h-[136px] sm:h-[160px]" />

        <div className="flex min-h-8 items-center gap-1.5 pt-1.5">
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label={PLAY_LABELS[state]}
            onClick={(event) => {
              if (state === "running") game.pause();
              else start();
              handBack(event);
            }}
            className="rounded-full bg-ink/[0.08]"
          >
            {state === "running" ? <Pause /> : <Play />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Restart"
            onClick={(event) => {
              game.reset();
              handBack(event);
            }}
            className="rounded-full"
          >
            <RotateCcw />
          </Button>
          <p role="status" className="ml-1 min-w-0 text-xs leading-4 text-stone">
            {HINTS[state]}
          </p>
        </div>
      </div>
    </section>
  );
}
