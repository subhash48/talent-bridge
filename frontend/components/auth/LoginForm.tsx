"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { authLinkStyles } from "@/components/auth/AuthCard";
import { AuthDivider, GoogleButton } from "@/components/auth/GoogleButton";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { SignInLoading } from "@/components/auth/SignInLoading";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  LOGIN_NOTICES,
  authContinuePath,
  authErrorMessage,
  authRedirectUrl,
  candidateCompletePath,
  landingPath,
  type Audience,
} from "@/lib/auth";
import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { ApiError, errorMessage } from "@/services/api";
import { getAccountStatus } from "@/services/accounts";
import { getCurrentUser } from "@/services/me";

export type { Audience };

// Reasons that mean the current session can't be used, so it's ended before anyone signs in again.
const UNUSABLE_SESSION = new Set(["account_not_linked", "account_disabled", "account_mismatch", "wrong_account"]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Signing in where the other kind of account belongs: stopped, and pointed to the right place, so a candidate
// account and an employer account are never mixed up. Keyed by the page the person was on.
const WRONG_PLACE: Record<Audience, { message: string; href: string; link: string }> = {
  employer: {
    message: "This is a candidate account. Use candidate sign in to follow your applications.",
    href: "/login?as=candidate",
    link: "Go to candidate sign in",
  },
  candidate: {
    message: "This is an employer account. Use employer sign in to open your workspace.",
    href: "/login?as=employer",
    link: "Go to employer sign in",
  },
};

// The sign-in card's own field styles: larger than the app's, with a clearer edge.
const labelStyles = "text-sm font-medium text-ink";
const inputStyles =
  "h-11 rounded-[10px] border-ink/15 bg-overlay px-3.5 text-[15px] hover:border-ink/25 focus-visible:border-accent focus-visible:bg-overlay focus-visible:ring-4 focus-visible:ring-accent/20";

type LoginFormProps = {
  next: string | null;
  reason: string | null;
  audience?: Audience | null;
  /** Offer "Email me a sign-in link" as well (employers, and the page for either). */
  emailLink?: boolean;
};

export function LoginForm({ next, reason, audience = null, emailLink = false }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Signing in, or signed in and waiting for the workspace: the loading screen is up.
  const [pending, setPending] = useState(false);
  // Set before the first await and cleared only by a failure, so the form is never sent twice at once.
  const submitting = useRef(false);
  // Sent back from a Google sign-in with the other kind of account: the same message as signing in here with it.
  const cameWrong = reason === "wrong_account" && audience ? audience : null;
  const [error, setError] = useState<string | null>(cameWrong ? WRONG_PLACE[cameWrong].message : null);
  const [wrongPlace, setWrongPlace] = useState<Audience | null>(cameWrong);
  // Signed in with an address that was never verified: offer the verification email again.
  const [unverified, setUnverified] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  // "Email me a sign-in link": sending, then sent (to this address).
  const [linkState, setLinkState] = useState<"idle" | "sending" | "sent">("idle");
  const [linkEmail, setLinkEmail] = useState("");
  const notice = reason && !cameWrong ? LOGIN_NOTICES[reason] : undefined;

  useEffect(() => {
    if (SUPABASE_CONFIGURED && reason && UNUSABLE_SESSION.has(reason))
      void createClient().auth.signOut({ scope: "local" });
  }, [reason]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enter still reaches the form behind the loading screen.
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    setWrongPlace(null);
    setUnverified(null);
    setResendState("idle");
    const supabase = createClient();
    const address = email.trim();
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: address, password });
      if (signInError) {
        if (signInError.code === "email_not_confirmed") setUnverified(address);
        fail(authErrorMessage(signInError));
        return;
      }
      // The role comes from the API, never from the browser: it decides which portal opens.
      const user = await getCurrentUser().catch(async (cause: unknown) => {
        if (cause instanceof ApiError && cause.code === "account_not_linked") {
          const setup = await unfinishedSetup(audience, next);
          if (setup) return setup;
        }
        throw cause;
      });
      if (typeof user === "string") {
        window.location.assign(user); // verified, but the account was never finished: finish it now
        return;
      }
      const isCandidate = user.role === "candidate";
      if (audience && isCandidate !== (audience === "candidate")) {
        await supabase.auth.signOut({ scope: "local" });
        setWrongPlace(audience);
        fail(WRONG_PLACE[audience].message);
        return;
      }
      // Still pending: the loading screen stays up until the browser has the workspace to show instead.
      window.location.assign(landingPath(user.role, next, user.workspace?.mode));
    } catch (cause) {
      await supabase.auth.signOut({ scope: "local" });
      fail(cause instanceof ApiError && cause.status === 403 ? cause.message : errorMessage(cause));
    }
  }

  /**
   * The verification email again, for an account that signed up but never opened it. Its link goes through
   * /auth/continue, which finishes whichever account the sign-up was for.
   */
  async function resendVerification() {
    if (!unverified) return;
    setResendState("sending");
    const continuePath = authContinuePath({ audience: null, intent: "signup", next, via: "email" });
    const { error: resendError } = await createClient().auth.resend({
      type: "signup",
      email: unverified,
      options: { emailRedirectTo: authRedirectUrl(continuePath) },
    });
    // As with the sign-in link: an address Supabase doesn't recognise gets the same answer.
    if (resendError && resendError.status !== 400 && resendError.status !== 422) {
      setResendState("idle");
      setError(authErrorMessage(resendError));
      return;
    }
    setResendState("sent");
  }

  /**
   * A one-time sign-in link by email, for anyone with an account: no password needed. It comes back through
   * /auth/continue, so the same checks as a password sign-in decide where it opens.
   */
  async function sendEmailLink() {
    const address = email.trim();
    if (!EMAIL.test(address)) {
      setError("Enter your email address first, then we'll send the link there.");
      return;
    }
    setError(null);
    setLinkState("sending");
    const continuePath = authContinuePath({ audience, intent: "signin", next, via: "email" });
    const { error: linkError } = await createClient().auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: authRedirectUrl(continuePath),
      },
    });
    // An unknown address gets the same answer, so the form never says who has an account.
    if (linkError && linkError.status !== 400 && linkError.status !== 422) {
      setLinkState("idle");
      setError(authErrorMessage(linkError));
      return;
    }
    setLinkEmail(address);
    setLinkState("sent");
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

  const forgotParams = new URLSearchParams();
  if (audience) forgotParams.set("as", audience);
  if (next) forgotParams.set("next", next);
  const forgotQuery = forgotParams.toString();
  const forgotHref = forgotQuery ? `/forgot-password?${forgotQuery}` : "/forgot-password";

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <AuthAlert>
          {error}
          {wrongPlace && (
            <>
              {" "}
              <Link href={WRONG_PLACE[wrongPlace].href} className="font-medium underline underline-offset-4">
                {WRONG_PLACE[wrongPlace].link}
              </Link>
            </>
          )}
          {unverified && resendState !== "sent" && (
            <span className="mt-2.5 block">
              <Button
                variant="secondary"
                size="sm"
                disabled={resendState === "sending"}
                onClick={() => void resendVerification()}
              >
                {resendState === "sending" ? "Sending…" : "Resend verification email"}
              </Button>
            </span>
          )}
        </AuthAlert>
      ) : linkState === "sent" ? (
        <AuthAlert tone="info">
          If {linkEmail} has an account, a sign-in link is on its way. Open it on this device to sign in.
        </AuthAlert>
      ) : (
        notice && <AuthAlert tone="info">{notice}</AuthAlert>
      )}
      {resendState === "sent" && unverified && (
        <AuthAlert tone="success">
          If {unverified} still needs verifying, a new link is on its way. Open it on this device, then sign in.
        </AuthAlert>
      )}

      <GoogleButton audience={audience} intent="signin" next={next} disabled={pending} />
      <AuthDivider>or sign in with email</AuthDivider>

      <form onSubmit={signIn} aria-busy={pending} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className={labelStyles}>
            Email address
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
          <PasswordInput
            id="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputStyles}
          />
          <div className="text-right text-[13px]">
            <Link href={forgotHref} className={cn(authLinkStyles, "rounded-sm")}>
              Forgot password?
            </Link>
          </div>
        </div>
        <Button type="submit" size="lg" disabled={pending} className="mt-1 h-11 w-full text-[15px]">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        {emailLink && (
          <Button
            variant="ghost"
            size="lg"
            disabled={pending || linkState === "sending"}
            onClick={() => void sendEmailLink()}
            className="-mt-1 h-11 w-full text-[14px] text-brand-ink hover:text-ink"
          >
            {linkState === "sending" ? "Sending…" : "Email me a sign-in link"}
          </Button>
        )}
        <SignInLoading active={pending} />
      </form>
    </div>
  );
}

/**
 * Where to finish an account that was verified but never set up (the tab closed before it was): the
 * candidate account, or the company's workspace. The account type given at sign-up decides, else the page's
 * audience; neither, and there's nothing to finish here.
 */
async function unfinishedSetup(audience: Audience | null, next: string | null): Promise<string | null> {
  const status = await getAccountStatus().catch(() => null);
  if (!status?.emailVerified || status.account !== "none") return null;
  const { data } = await createClient().auth.getUser();
  const said = data.user?.user_metadata?.account_type;
  const kind = said === "employer" || said === "candidate" ? said : audience;
  if (kind === "employer") return "/onboarding/workspace";
  if (kind === "candidate") return candidateCompletePath(next);
  return null;
}
