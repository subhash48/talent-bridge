"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { AuthCard, authLinkStyles } from "@/components/auth/AuthCard";
import { buttonStyles } from "@/components/ui/Button";
import { localPath } from "@/lib/auth";
import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";

type Problem = "used_or_expired" | "invalid";

/**
 * Finishes an email link whose session arrives in the URL fragment, which only the browser can read.
 *
 * Supabase's default invitation email links to its own /auth/v1/verify. That checks the one-time token
 * and redirects here with the new session as #access_token=…&refresh_token=…&type=invite, or with
 * #error=…&error_code=otp_expired when the link has expired or was already used. The browser client
 * can't take that session itself: it runs the PKCE flow, which refuses implicit-flow URLs.
 *
 * So: the fragment is read once and cleared from the address bar and history before anything else
 * runs, the tokens go to Supabase, which checks them (it looks the user up with the access token)
 * before the session is kept, and the browser continues to `next`. Links that carry their token in
 * the query instead (?code=, or ?token_hash= from a customised email template) are verified on the
 * server by /auth/confirm.
 */
export function AuthCallback() {
  const started = useRef(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    // Development runs effects twice, and the fragment is gone after the first run.
    if (started.current) return;
    started.current = true;
    void finish().then((result) => {
      if (result) setProblem(result);
    });
  }, []);

  if (!problem) {
    return (
      <AuthCard title="Signing you in…" description="One moment while we open your invitation.">
        <div className="flex justify-center py-2 text-stone" role="status" aria-label="Signing you in">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      </AuthCard>
    );
  }

  // Fixed wording: nothing from the URL is shown, so a crafted link can't put words on this page.
  const usedOrExpired = problem === "used_or_expired";
  return (
    <AuthCard
      title={usedOrExpired ? "This link has expired or was already used" : "This link didn't work"}
      description={
        usedOrExpired ? "Invitation links work once, and only for a limited time." : "It may be incomplete or out of date."
      }
    >
      <div className="flex flex-col gap-4">
        <AuthAlert tone="info">
          Already chose your password? Sign in with the email you applied with. Otherwise, get a new link with
          “Forgot password”.
        </AuthAlert>
        <Link href="/login" className={buttonStyles({ size: "lg", className: "w-full" })}>
          Sign in
        </Link>
        <Link href="/forgot-password" className={`${authLinkStyles} text-center text-sm`}>
          Get a new link
        </Link>
      </div>
    </AuthCard>
  );
}

async function finish(): Promise<Problem | null> {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const query = url.searchParams;
  const next = localPath(query.get("next")) ?? "/";

  if (!fragment.has("access_token") && (query.has("code") || query.has("token_hash"))) {
    window.location.replace(`/auth/confirm${url.search}`);
    return null;
  }

  // Before anything else: the tokens leave the address bar and this history entry.
  window.history.replaceState(window.history.state, "", `${url.pathname}?next=${encodeURIComponent(next)}`);

  const failed = ["error", "error_code", "error_description"].some((key) => fragment.has(key) || query.has(key));
  if (failed) return "used_or_expired";
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (!accessToken || !refreshToken || !SUPABASE_CONFIGURED) return "invalid";

  const { error } = await createClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) return "invalid";
  window.location.replace(next);
  return null;
}
