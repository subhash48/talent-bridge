"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/** The small word under the headline, changing every few seconds. Still for anyone who asked for less motion. */
export function RotatingWord({ words, className }: { words: readonly string[]; className?: string }) {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    if (words.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setShown(false);
      window.setTimeout(() => {
        setIndex((current) => (current + 1) % words.length);
        setShown(true);
      }, 220);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [words]);

  return (
    <span aria-live="off" className={cn("inline-block transition-opacity duration-200", shown ? "opacity-100" : "opacity-0", className)}>
      {words[index]}
    </span>
  );
}
