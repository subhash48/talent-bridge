"use client";

import { useEffect, useRef, useState } from "react";

import { EncordMark } from "@/components/shared/EncordLogo";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

const VIDEO = "/videos/encord-loading.mp4";

/**
 * The wait between sending the sign-in form and the workspace opening: Encord's logo animation,
 * centred on a full screen of the page's own background. It loops until the browser has the
 * workspace to show instead, or until sign-in fails and the form comes back.
 *
 * The video loads with the page, so it is ready the moment the form is sent. The still logo stands in
 * until it can play, for anyone who asks for reduced motion, and whenever it can't be played.
 */
export function SignInLoading({ active }: { active: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // False on the server and with reduced motion: the video is then never requested.
  const motion = useMediaQuery("(prefers-reduced-motion: no-preference)");
  const playable = motion && !failed;

  // It plays from the start each time the screen comes up, and only while it is up.
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    if (!active) {
      player.pause();
      return;
    }
    player.currentTime = 0;
    player.play().catch((error: unknown) => {
      // Stopped because sign-in failed first: nothing is wrong with the video.
      if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
    });
  }, [active, playable]);

  return (
    <div role="status" hidden={!active} className="fixed inset-0 z-50 flex items-center justify-center bg-canvas">
      {playable && (
        <video
          ref={video}
          src={VIDEO}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden
          onCanPlay={() => setReady(true)}
          onError={() => setFailed(true)}
          // The video has a backdrop of its own, so its edges fade into the page's.
          className={cn("w-full max-w-[640px] [mask-image:radial-gradient(closest-side,black_62%,transparent)]", !ready && "hidden")}
        />
      )}
      {!(playable && ready) && (
        <span className="inline-flex items-center gap-3 text-ink">
          <EncordMark className="h-10 w-auto" />
          <span className="text-[32px] font-semibold tracking-[0.08em]">ENCORD</span>
        </span>
      )}
      <span className="sr-only">Signing you in…</span>
    </div>
  );
}
