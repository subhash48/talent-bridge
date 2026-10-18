import { TalentBridgeMark } from "@/components/shared/TalentBridgeLogo";

/**
 * The wait between sending the sign-in form and the workspace opening: the TalentBridge mark, centred
 * on a full screen of the page's own background. It stays until the browser has the workspace to show
 * instead, or until sign-in fails and the form comes back. The mark pulses only for people who
 * haven't asked for reduced motion.
 */
export function SignInLoading({ active }: { active: boolean }) {
  return (
    <div role="status" hidden={!active} className="fixed inset-0 z-50 flex items-center justify-center bg-canvas">
      <span className="inline-flex items-center gap-3 text-ink">
        <TalentBridgeMark className="h-10 w-auto motion-safe:animate-pulse" />
        <span className="text-[32px] font-semibold tracking-[-0.01em]">TalentBridge</span>
      </span>
      <span className="sr-only">Signing you in…</span>
    </div>
  );
}
