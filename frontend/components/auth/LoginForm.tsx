"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { SignInLoading } from "@/components/auth/SignInLoading";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LOGIN_NOTICES, authErrorMessage, landingPath } from "@/lib/auth";
import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { ApiError, errorMessage } from "@/services/api";
import { getCurrentUser } from "@/services/me";

// Reasons that mean the current session can't be used, so it's ended before anyone signs in again.
const UNUSABLE_SESSION = new Set(["account_not_linked", "account_disabled", "account_mismatch"]);

// The sign-in card's own field styles (components/auth/LoginCard.tsx): larger than the app's, with a clearer edge.
const labelStyles = "text-sm font-medium text-ink";
const inputStyles =
  "h-11 rounded-[10px] border-ink/[0.14] bg-black/25 px-3.5 text-[15px] hover:border-ink/[0.28] focus-visible:border-ink/60 focus-visible:bg-black/25 focus-visible:ring-4 focus-visible:ring-ink/15";

export function LoginForm({ next, reason }: { next: string | null; reason: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordShown, setPasswordShown] = useState(false);
  // Signing in, or signed in and waiting for the workspace: the loading screen is up.
  const [pending, setPending] = useState(false);
  // Set before the first await and cleared only by a failure, so the form is never sent twice at once.
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const notice = reason ? LOGIN_NOTICES[reason] : undefined;

  useEffect(() => {
    if (SUPABASE_CONFIGURED && reason && UNUSABLE_SESSION.has(reason)) void createClient().auth.signOut({ scope: "local" });
  }, [reason]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enter still reaches the form behind the loading screen.
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    const supabase = createClient();
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        fail(authErrorMessage(signInError));
        return;
      }
      // The role comes from the API, never from the browser: it decides which portal opens.
      const user = await getCurrentUser();
      // Still pending: the loading screen stays up until the browser has the workspace to show instead.
      window.location.assign(landingPath(user.role, next));
    } catch (cause) {
      await supabase.auth.signOut({ scope: "local" });
      fail(cause instanceof ApiError && cause.status === 403 ? cause.message : errorMessage(cause));
    }
  }

  /** Back to the form, with what went wrong shown on it. */
  function fail(message: string) {
    setError(message);
    setPending(false);
    submitting.current = false;
  }

  if (!SUPABASE_CONFIGURED) {
    return (
      <AuthAlert>
        Sign-in isn&apos;t configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in
        frontend/.env.local, then restart the frontend.
      </AuthAlert>
    );
  }

  return (
    <form onSubmit={signIn} aria-busy={pending} className="flex flex-col gap-4.5">
      {error ? <AuthAlert>{error}</AuthAlert> : notice && <AuthAlert tone="info">{notice}</AuthAlert>}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={labelStyles}>
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={inputStyles}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={labelStyles}>
          Password
        </label>
        <div className="relative">
          <Input
            id="password"
            type={passwordShown ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={cn(inputStyles, "pr-11")}
          />
          <button
            type="button"
            aria-label="Show password"
            aria-pressed={passwordShown}
            onClick={() => setPasswordShown((shown) => !shown)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-[10px] text-stone transition-colors hover:text-ink"
          >
            {passwordShown ? <EyeOff aria-hidden className="size-[18px]" /> : <Eye aria-hidden className="size-[18px]" />}
          </button>
        </div>
        <div className="text-right text-[13px]">
          <Link
            href="/forgot-password"
            className="rounded-sm font-medium text-charcoal underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="h-11 w-full rounded-[10px] text-base font-semibold"
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <SignInLoading active={pending} />
    </form>
  );
}
