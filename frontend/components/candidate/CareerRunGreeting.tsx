"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";

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
  className?: string;
};

/**
 * The dashboard's greeting, set in Career Run: a small dinosaur runner (lib/career-run.ts) played
 * right here. The greeting, name and status line sit top left and stay readable; the track runs
 * underneath them. A click or tap starts a run, and keys are only read while the game has focus.
 *
 * The game is a break, not portal use: its score never leaves the browser, and its input is marked
 * so the portal's activity reporting (lib/engagement.ts) skips it.
 */
export function CareerRunGreeting({ greeting, name, status, className }: CareerRunGreetingProps) {
  const [game] = useState(() => new CareerRun());
  const { state, score, best } = useSyncExternalStore(game.subscribe, game.getSnapshot, () => READY);
  const area = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const track = useRef<HTMLDivElement>(null);
  // A press that already made the dinosaur jump mustn't count again as the click that follows it.
  const jumped = useRef(false);

  useEffect(() => {
    const box = area.current;
    const band = track.current;
    if (!box || !band || !canvas.current) return;
    game.attach(canvas.current);
    const fit = () => game.resize({ width: box.clientWidth, height: box.clientHeight, top: band.offsetTop, ground: band.offsetTop + band.offsetHeight });
    const resized = new ResizeObserver(fit);
    resized.observe(box);
    // The typeface may arrive after the first paint.
    void document.fonts.ready.then(() => game.draw());
    // Zooming, or moving to another screen, changes the pixels behind the card without changing its size.
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
      if (document.activeElement instanceof HTMLElement && box.contains(document.activeElement)) document.activeElement.blur();
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
  const focusGame = () => area.current?.focus({ preventScroll: true });
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
    <section
      ref={area}
      role="group"
      aria-label="Career Run, a small dinosaur game. Space or Arrow Up jumps, P pauses."
      tabIndex={0}
      data-not-portal-activity
      onPointerDown={(event) => {
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
      // Keys are only read while the game has focus, so a run can't carry on without it.
      onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && game.pause()}
      className={cn(
        "relative isolate touch-manipulation overflow-hidden rounded-[20px] border border-border bg-canvas/60 px-4 pt-4 pb-3 select-none focus-visible:outline-white/40 sm:px-5 lg:-mx-6 lg:px-6 lg:pt-5",
        className,
      )}
    >
      <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 -z-10 size-full" />

      <div className="flex items-start justify-between gap-4">
        <h1 className="min-w-0">
          <span className="block text-[17px] leading-6 text-charcoal/80 sm:text-lg sm:leading-6">{greeting},</span>
          <span className="block truncate text-[32px] leading-[1.1] font-semibold tracking-[-0.03em] text-charcoal sm:text-[38px]">
            {name}
          </span>
        </h1>
        {/* On a wide dashboard this card runs up under the top bar, so the score drops below the avatar. */}
        <p className="relative shrink-0 text-right text-[17px] text-charcoal tabular-nums lg:mt-7">
          Score {score}
          {/* Hung under the score, so the card doesn't grow when a best score first appears. */}
          {best > 0 && <span className="absolute top-full right-0 text-xs whitespace-nowrap text-faint">Best {best}</span>}
        </p>
      </div>
      <p className="mt-1 max-w-[62ch] text-[15px] text-stone">{status}</p>

      {/* The track's band: the canvas draws the run here, with the ground along its bottom edge. */}
      <div ref={track} aria-hidden className="h-[150px] sm:h-[184px]" />

      <div className="flex min-h-9 items-center gap-1.5 pt-2">
        <Button
          variant="secondary"
          size="icon-sm"
          aria-label={PLAY_LABELS[state]}
          onClick={(event) => {
            if (state === "running") game.pause();
            else start();
            handBack(event);
          }}
          className="rounded-full bg-white/[0.1]"
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
        <p role="status" className="ml-1.5 min-w-0 text-[13px] leading-4 text-stone">
          {HINTS[state]}
        </p>
      </div>
    </section>
  );
}
