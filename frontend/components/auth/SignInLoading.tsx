import { HirvelloLogo } from "@/components/shared/HirvelloLogo";

/**
 * The wait between sending the sign-in form and the workspace opening: the Hirvello logo, centred on a full
 * screen of the sky. It stays until the browser has the workspace to show instead, or until sign-in fails and the
 * form comes back. The logo breathes only for people who haven't asked for reduced motion.
 */
export function SignInLoading({ active }: { active: boolean }) {
  return (
    <div role="status" hidden={!active} className="sky-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <HirvelloLogo className="scale-150 motion-safe:animate-pulse" />
      <span className="sr-only">Signing you in…</span>
    </div>
  );
}
