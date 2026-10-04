"use client";

import { CircleCheck, LoaderCircle, LogIn, MailCheck, MailWarning, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { authLinkStyles } from "@/components/auth/AuthCard";
import { ApplyProblemAlert, type ApplyProblem } from "@/components/careers/ApplyProblemAlert";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { ApplyOutcome, ApplyResult } from "@/types/careers";

// Opening either one submits the pending application. /login sends someone already signed in as a
// candidate straight on to `next`; it and the portal both ask GET /me first, and that call is what
// submits it. Signed out, /candidate sends them to /login?next=/candidate (proxy.ts).
const SIGN_IN_PATH = "/login?next=/candidate";
const PORTAL_PATH = "/candidate";

const TONES = {
  positive: "bg-sage/10 text-emerald-300 ring-sage/25",
  ai: "bg-ai/12 text-violet-200 ring-ai/30",
  attention: "bg-amber-400/10 text-amber-200 ring-amber-300/25",
} as const;

const VIEWS: Record<ApplyOutcome, { title: string; icon: LucideIcon; tone: keyof typeof TONES }> = {
  invitation_sent: { title: "Check your inbox", icon: MailCheck, tone: "positive" },
  sign_in_required: { title: "Sign in to submit your application", icon: LogIn, tone: "ai" },
  already_applied: { title: "You've already applied", icon: CircleCheck, tone: "positive" },
  invitation_failed: { title: "Your application is saved", icon: MailWarning, tone: "attention" },
};

type ApplyResultCardProps = {
  result: ApplyResult;
  /** Why the last "Try again" failed. */
  problem: ApplyProblem | null;
  retrying: boolean;
  /** "Try again" went through, and the email still couldn't be sent. */
  stillFailing: boolean;
  onRetry: () => void;
};

/** What happened to the application, in place of the form, and the one thing to do next. */
export function ApplyResultCard({ result, problem, retrying, stillFailing, onRetry }: ApplyResultCardProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const signedInAs = useSignedInEmail();
  const { title, icon: Icon, tone } = VIEWS[result.status];
  const needsAccount = result.status === "sign_in_required" || result.status === "already_applied";
  const otherAccount = needsAccount && signedInAs && signedInAs !== result.email.toLowerCase() ? signedInAs : null;
  const email = <strong className="font-medium text-ink">{result.email}</strong>;
  const job = <strong className="font-medium text-ink">{result.jobTitle}</strong>;

  // Every outcome, the same one again after "Try again" included, moves focus to its heading, so
  // it's read out and scrolled into view.
  useEffect(() => {
    heading.current?.focus();
  }, [result]);

  // "Try again" was disabled while it ran: when it fails, it gets focus back.
  useEffect(() => {
    if (problem) retryButton.current?.focus();
  }, [problem]);

  return (
    <Card className="p-6 sm:p-8">
      <span className={cn("flex size-12 items-center justify-center rounded-full ring-1", TONES[tone])}>
        <Icon aria-hidden className="size-[22px]" />
      </span>
      <h2 ref={heading} tabIndex={-1} className="mt-5 text-2xl font-semibold tracking-tight text-ink focus:outline-none">
        {title}
      </h2>

      <div className="mt-2 flex flex-col gap-3 text-[15px] leading-relaxed text-charcoal">
        {result.status === "invitation_sent" && (
          <>
            <p>
              We&apos;ve sent an email to {email}. Open the link in it to activate your candidate portal account: your
              application for {job} is submitted as soon as you do.
            </p>
            <p className="text-sm text-stone">Didn&apos;t get it? Check your spam folder.</p>
          </>
        )}
        {result.status === "sign_in_required" && (
          <p>
            {email} already has a candidate portal account. Sign in with it to submit your application for {job}.
          </p>
        )}
        {result.status === "already_applied" && <p>Your application for {job} is in your candidate portal.</p>}
        {result.status === "invitation_failed" && (
          <p>We couldn&apos;t send the activation email to {email} just now. Try again in a few minutes.</p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 empty:hidden">
        {otherAccount && (
          <AuthAlert tone="info">
            You&apos;re signed in as <strong className="font-medium">{otherAccount}</strong> in this browser. Continuing
            signs you out of that account first.
          </AuthAlert>
        )}
        {stillFailing && !retrying && !problem && (
          <p role="status" className="text-sm text-stone">
            We still couldn&apos;t send it. Wait a few minutes, then try again.
          </p>
        )}
        {problem && <ApplyProblemAlert problem={problem} />}
      </div>

      <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        {result.status === "sign_in_required" && (
          <Continue href={SIGN_IN_PATH} signOutFirst={Boolean(otherAccount)}>
            Sign in to submit
          </Continue>
        )}
        {result.status === "already_applied" && (
          <Continue href={PORTAL_PATH} signOutFirst={Boolean(otherAccount)}>
            Open your candidate portal
          </Continue>
        )}
        {result.status === "invitation_failed" && (
          <Button ref={retryButton} size="lg" onClick={onRetry} disabled={retrying}>
            {retrying && <LoaderCircle className="animate-spin" aria-hidden />}
            {retrying ? "Trying again…" : "Try again"}
          </Button>
        )}
        <Link href="/demo/careers" className={cn(authLinkStyles, "text-sm")}>
          See other open roles
        </Link>
      </div>
      <p className="sr-only" aria-live="polite">
        {retrying ? "Trying again…" : ""}
      </p>
    </Card>
  );
}

/**
 * The way on to sign-in or the portal. Anyone else signed in in this browser (often the recruiter
 * trying the demo) would land in their own workspace instead, so their session ends first.
 */
function Continue({ href, signOutFirst, children }: { href: string; signOutFirst: boolean; children: ReactNode }) {
  const [leaving, setLeaving] = useState(false);

  async function signOutAndContinue() {
    setLeaving(true);
    await createClient().auth.signOut({ scope: "local" });
    window.location.assign(href);
  }

  if (signOutFirst) {
    return (
      <Button size="lg" onClick={() => void signOutAndContinue()} disabled={leaving}>
        {leaving && <LoaderCircle className="animate-spin" aria-hidden />}
        {children}
      </Button>
    );
  }
  // Not prefetched: opening it is what submits the application.
  return (
    <Link href={href} prefetch={false} className={buttonStyles({ size: "lg" })}>
      {children}
    </Link>
  );
}

/** The email of whoever is signed in in this browser, lowercased: null while checking, or when nobody is. */
function useSignedInEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;
    let current = true;
    void createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (current) setEmail(data.session?.user.email?.toLowerCase() ?? null);
      });
    return () => {
      current = false;
    };
  }, []);
  return email;
}
