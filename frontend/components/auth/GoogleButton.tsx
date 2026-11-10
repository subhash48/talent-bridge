"use client";

import { useEffect, useState } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { authContinuePath, authRedirectUrl, type Audience, type AuthIntent } from "@/lib/auth";
import { SUPABASE_CONFIGURED, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { WorkspaceMode } from "@/types/workspace";

const UNAVAILABLE = "Google sign-in isn't available right now. Use your email and password.";

// Whether the Supabase project has Google turned on, asked once per page load: a project without it would send
// people to an error page at Supabase rather than to Google.
let googleEnabled: Promise<boolean> | null = null;

function isGoogleEnabled(): Promise<boolean> {
  googleEnabled ??= fetch(`${SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(10000),
  })
    .then(async (response) => {
      if (!response.ok) return false;
      const settings = (await response.json()) as { external?: { google?: boolean } };
      return settings.external?.google === true;
    })
    .catch(() => false);
  return googleEnabled;
}

type GoogleButtonProps = {
  audience: Audience | null;
  intent: AuthIntent;
  /** The workspace mode an employer picked before making their account. */
  mode?: WorkspaceMode | null;
  /** Where to go after, a local path; checked again on the way back. */
  next?: string | null;
  disabled?: boolean;
  className?: string;
};

/**
 * "Continue with Google": Supabase Auth's Google sign-in, in the PKCE flow. Google sends the person back to
 * /auth/confirm, which turns the code into the session cookie, and on to /auth/continue, which asks the API what
 * the account is in Hirvello and opens the right place (or finishes a new account). The button is white, the one
 * white block on these pages, because that's how Google's own button looks.
 */
export function GoogleButton({ audience, intent, mode, next, disabled, className }: GoogleButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Coming back from Google with the Back button can restore this page as it was left, still "Connecting".
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => event.persisted && setPending(false);
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

  async function start() {
    if (pending) return;
    setPending(true);
    setError(null);
    if (!SUPABASE_CONFIGURED || !(await isGoogleEnabled())) {
      setError(UNAVAILABLE);
      setPending(false);
      return;
    }
    const continuePath = authContinuePath({ audience, intent, mode, next });
    try {
      const { error: oauthError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: authRedirectUrl(continuePath),
          // Always ask which Google account, so someone signed in to several can choose the right one.
          queryParams: { prompt: "select_account" },
        },
      });
      if (oauthError) throw oauthError;
    } catch {
      setError(UNAVAILABLE);
      setPending(false);
    }
    // Otherwise the browser is on its way to Google: the button stays busy until the page goes.
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {error && <AuthAlert>{error}</AuthAlert>}
      <button
        type="button"
        onClick={() => void start()}
        disabled={disabled || pending}
        aria-busy={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-full border border-ink/15 bg-white px-5 text-[15px] font-semibold text-ink shadow-[0_1px_2px_rgb(20_35_59/0.06)] transition-[background-color,border-color,box-shadow] duration-200 select-none hover:border-ink/25 hover:bg-[#f8fafd] hover:shadow-[0_2px_8px_rgb(20_35_59/0.08)] focus-visible:ring-4 focus-visible:ring-accent/25 focus-visible:outline-none active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
      >
        <GoogleMark />
        {pending ? "Connecting to Google…" : "Continue with Google"}
      </button>
    </div>
  );
}

/** Google's "G", in its four colours. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="size-[18px] shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** The line between Google and the email form: "or sign in with email". */
export function AuthDivider({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 text-[13px] text-stone" role="separator" aria-label={children}>
      <span aria-hidden className="h-px flex-1 bg-ink/[0.1]" />
      <span aria-hidden>{children}</span>
      <span aria-hidden className="h-px flex-1 bg-ink/[0.1]" />
    </div>
  );
}
