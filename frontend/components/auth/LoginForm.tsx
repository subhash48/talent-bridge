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
import { getAccountStatus } from "@/services/accounts";
import { getCurrentUser } from "@/services/me";

// Reasons that mean the current session can't be used, so it's ended before anyone signs in again.
const UNUSABLE_SESSION = new Set(["account_not_linked", "account_disabled", "account_mismatch"]);

/** Who a sign-in page is for: a candidate, or someone who hires. Unset, it takes either. */
export type Audience = "candidate" | "employer";

// Signing in where the other kind of account belongs: stopped, and pointed to the right place, so a candidate
// account and an employer account are never mixed up.
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

// The sign-in card's own field styles (components/auth/LoginCard.tsx): larger than the app's, with a clearer edge.
const labelStyles = "text-sm font-medium text-ink";
const inputStyles =
  "h-11 rounded-[10px] border-border-strong bg-overlay px-3.5 text-[15px] hover:border-ink/30 focus-visible:border-brand-ink focus-visible:bg-overlay focus-visible:ring-4 focus-visible:ring-brand-ink/65";

export function LoginForm({
  next,
  reason,
  audience = null,
}: {
  next: string | null;
  reason: string | null;
  audience?: Audience | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordShown, setPasswordShown] = useState(false);
  // Signing in, or signed in and waiting for the workspace: the loading screen is up.
  const [pending, setPending] = useState(false);
  // Set before the first await and cleared only by a failure, so the form is never sent twice at once.
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [wrongPlace, setWrongPlace] = useState<Audience | null>(null);
  // "Email me a sign-in link": sending, then sent (to this address).
  const [linkState, setLinkState] = useState<"idle" | "sending" | "sent">("idle");
  const [linkEmail, setLinkEmail] = useState("");
  const notice = reason ? LOGIN_NOTICES[reason] : undefined;

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
    const supabase = createClient();
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        fail(authErrorMessage(signInError));
        return;
      }
      // The role comes from the API, never from the browser: it decides which portal opens.
      const user = await getCurrentUser().catch(async (cause: unknown) => {
        if (cause instanceof ApiError && cause.code === "account_not_linked") {
          const setup = await unfinishedSetup(audience);
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

  /** A one-time sign-in link by email, for anyone with an account: no password needed. */
  async function emailLink() {
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter your email address first, then we'll send the link there.");
      return;
    }
    setError(null);
    setLinkState("sending");
    const target = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next ?? "/")}`;
    const { error: linkError } = await createClient().auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: false, emailRedirectTo: target },
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

  return (
    <form onSubmit={signIn} aria-busy={pending} className="flex flex-col gap-4.5">
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
        </AuthAlert>
      ) : linkState === "sent" ? (
        <AuthAlert tone="info">
          If {linkEmail} has an account, a sign-in link is on its way. Open it on this device to sign in.
        </AuthAlert>
      ) : (
        notice && <AuthAlert tone="info">{notice}</AuthAlert>
      )}
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
            {passwordShown ? (
              <EyeOff aria-hidden className="size-[18px]" />
            ) : (
              <Eye aria-hidden className="size-[18px]" />
            )}
          </button>
        </div>
        <div className="text-right text-[13px]">
          <Link
            href="/forgot-password"
            className="rounded-sm font-medium text-brand-ink underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>
      <Button type="submit" size="lg" disabled={pending} className="h-11 w-full rounded-[10px] text-base font-semibold">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <Button
        variant="secondary"
        size="lg"
        disabled={pending || linkState === "sending"}
        onClick={() => void emailLink()}
        className="h-11 w-full rounded-[10px] text-[15px]"
      >
        {linkState === "sending" ? "Sending…" : "Email me a sign-in link"}
      </Button>
      <SignInLoading active={pending} />
    </form>
  );
}

/**
 * Where to finish an account that was verified but never set up (the tab closed before it was): the
 * candidate account, or the company's workspace. The account type given at sign-up decides, else the page's
 * audience; neither, and there's nothing to finish here.
 */
async function unfinishedSetup(audience: Audience | null): Promise<string | null> {
  const status = await getAccountStatus().catch(() => null);
  if (!status?.emailVerified || status.account !== "none") return null;
  const { data } = await createClient().auth.getUser();
  const said = data.user?.user_metadata?.account_type;
  const kind = said === "employer" || said === "candidate" ? said : audience;
  if (kind === "employer") return "/onboarding/workspace";
  if (kind === "candidate") return "/signup/complete";
  return null;
}
