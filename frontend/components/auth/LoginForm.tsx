"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { authLinkStyles } from "@/components/auth/AuthCard";
import { SignInLoading } from "@/components/auth/SignInLoading";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { LOGIN_NOTICES, authErrorMessage, landingPath } from "@/lib/auth";
import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";
import { ApiError, errorMessage } from "@/services/api";
import { getCurrentUser } from "@/services/me";

// Reasons that mean the current session can't be used, so it's ended before anyone signs in again.
const UNUSABLE_SESSION = new Set(["account_not_linked", "account_disabled", "account_mismatch"]);

export function LoginForm({ next, reason }: { next: string | null; reason: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <form onSubmit={signIn} aria-busy={pending} className="flex flex-col gap-4">
      {error ? <AuthAlert>{error}</AuthAlert> : notice && <AuthAlert tone="info">{notice}</AuthAlert>}
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      <div className="-mt-1 text-right text-xs">
        <Link href="/forgot-password" className={authLinkStyles}>
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <SignInLoading active={pending} />
    </form>
  );
}
