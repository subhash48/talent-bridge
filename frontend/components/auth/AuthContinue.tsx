"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { AUDIENCE_EYEBROW, AuthCard } from "@/components/auth/AuthCard";
import { Button, buttonStyles } from "@/components/ui/Button";
import { candidateCompletePath, landingPath, loginPath, type Audience, type AuthIntent } from "@/lib/auth";
import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";
import { ApiError, errorMessage } from "@/services/api";
import { getAccountStatus } from "@/services/accounts";
import { getCurrentUser } from "@/services/me";
import type { WorkspaceMode } from "@/types/workspace";

export type ContinueParams = {
  audience: Audience | null;
  intent: AuthIntent;
  mode: WorkspaceMode | null;
  next: string | null;
  /** How the sign-in itself went, from /auth/confirm: cancelled at Google, or failed. */
  error: "cancelled" | "failed" | null;
  /** "email": an emailed link brought them here, not Google. */
  via: "email" | null;
};

type State =
  | { kind: "working" }
  // Signed in with Google, but no Hirvello workspace uses that address: set one up, or try another account.
  | { kind: "no_workspace"; email: string | null }
  // Signed in, but nothing says which account to make: a candidate's, or a company's.
  | { kind: "choose"; email: string | null }
  // The sign-in's email isn't verified, so the API won't make an account for it.
  | { kind: "unverified"; email: string | null }
  | { kind: "problem"; message: string };

/**
 * After Google (or an emailed link) has signed someone in, /auth/confirm brings them here. The API says what the
 * sign-in is in Hirvello (GET /me): an account of the kind this page was for opens its home or `next`; the other
 * kind is signed out and sent back with the reason; a verified address with no account yet goes on to make one
 * (a candidate's at once; an employer's workspace when they came to set one up). The role always comes from the
 * API, never from Google or the browser.
 */
export function AuthContinue({ audience, intent, mode, next, error, via }: ContinueParams) {
  const [state, setState] = useState<State>({ kind: "working" });
  const started = useRef(false);

  const run = useCallback(async () => {
    const login = (reason: string) => window.location.replace(loginPath({ audience, reason, next }));
    if (error) return login(via === "email" ? "link_invalid" : error === "cancelled" ? "google_cancelled" : "google_failed");
    if (!SUPABASE_CONFIGURED) return setState({ kind: "problem", message: "Sign-in isn't configured on this site yet." });

    const supabase = createClient();

    async function newAccount() {
      const status = await getAccountStatus().catch(() => null);
      if (!status || status.account !== "none") return login("account_not_linked");
      if (!status.emailVerified) return setState({ kind: "unverified", email: status.email });
      // The page they came from decides; a sign-up made here says which account it was for (it grants nothing).
      const { data } = await supabase.auth.getUser();
      const said = data.user?.user_metadata?.account_type;
      const kind = audience ?? (said === "candidate" || said === "employer" ? said : null);
      if (kind === "candidate") return window.location.replace(candidateCompletePath(next));
      if (kind === "employer" && (intent === "signup" || said === "employer")) {
        return window.location.replace(mode ? `/onboarding/workspace?mode=${mode}` : "/onboarding/workspace");
      }
      if (kind === "employer") return setState({ kind: "no_workspace", email: status.email });
      setState({ kind: "choose", email: status.email });
    }

    try {
      const user = await getCurrentUser();
      if (audience && (user.role === "candidate") !== (audience === "candidate")) {
        await supabase.auth.signOut({ scope: "local" });
        return login("wrong_account");
      }
      window.location.replace(landingPath(user.role, next, user.workspace?.mode));
    } catch (cause) {
      if (!(cause instanceof ApiError)) return setState({ kind: "problem", message: errorMessage(cause) });
      if (cause.status === 401) return login("expired");
      if (cause.status === 403 && cause.code === "account_not_linked") return newAccount();
      if (cause.status === 403) return login(cause.code);
      setState({ kind: "problem", message: errorMessage(cause) });
    }
  }, [audience, intent, mode, next, error, via]);

  useEffect(() => {
    // Development runs effects twice; the redirects must only start once.
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  /** Signs out of this account here and goes back to sign in, so another account can be used. */
  async function switchAccount() {
    setState({ kind: "working" });
    if (SUPABASE_CONFIGURED) await createClient().auth.signOut({ scope: "local" });
    window.location.replace(loginPath({ audience, next }));
  }

  const eyebrow = audience ? AUDIENCE_EYEBROW[audience] : undefined;
  const address = (email: string | null) => (email ? <strong className="font-medium text-ink">{email}</strong> : "this address");

  if (state.kind === "working") {
    return (
      <AuthCard eyebrow={eyebrow} title="Signing you in…" description="One moment while we open your account.">
        <div className="flex justify-center py-2 text-stone" role="status" aria-label="Signing you in">
          <LoaderCircle className="size-6 motion-safe:animate-spin" />
        </div>
      </AuthCard>
    );
  }

  if (state.kind === "no_workspace") {
    return (
      <AuthCard eyebrow={eyebrow} title="No workspace yet" description="Signing in worked, but there's nothing to open yet.">
        <div className="flex flex-col gap-3">
          <AuthAlert tone="info">No Hirvello workspace uses {address(state.email)} yet.</AuthAlert>
          <Link href="/onboarding/workspace" className={buttonStyles({ size: "lg", className: "w-full" })}>
            Set up your company
          </Link>
          <Button variant="secondary" size="lg" className="w-full" onClick={() => void switchAccount()}>
            Use a different account
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (state.kind === "choose") {
    return (
      <AuthCard title="Welcome to Hirvello" description="You're signed in. Which account would you like to make?">
        <div className="flex flex-col gap-3">
          <AuthAlert tone="info">No Hirvello account uses {address(state.email)} yet.</AuthAlert>
          <Link href={candidateCompletePath(next)} className={buttonStyles({ size: "lg", className: "w-full" })}>
            Create a candidate account
          </Link>
          <Link href="/onboarding/workspace" className={buttonStyles({ variant: "secondary", size: "lg", className: "w-full" })}>
            Set up your company
          </Link>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => void switchAccount()}>
            Use a different account
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (state.kind === "unverified") {
    return (
      <AuthCard eyebrow={eyebrow} title="Verify your email first" description="Hirvello only opens accounts for verified addresses.">
        <div className="flex flex-col gap-3">
          <AuthAlert tone="info">
            {address(state.email)} isn&apos;t verified yet. Verify it with your email provider, or sign in with your email and
            password instead.
          </AuthAlert>
          <Button size="lg" className="w-full" onClick={() => void switchAccount()}>
            Use a different account
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard eyebrow={eyebrow} title="We couldn't finish signing you in" description="Try again in a moment.">
      <div className="flex flex-col gap-3">
        <AuthAlert>{state.message}</AuthAlert>
        <Button
          size="lg"
          className="w-full"
          onClick={() => {
            setState({ kind: "working" });
            void run();
          }}
        >
          Try again
        </Button>
        <Button variant="secondary" size="lg" className="w-full" onClick={() => void switchAccount()}>
          Back to sign in
        </Button>
      </div>
    </AuthCard>
  );
}
