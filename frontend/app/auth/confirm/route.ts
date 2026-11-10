import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { localPath } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase-server";

/**
 * Where Supabase's emails and Google sign-in land: sign-up confirmation, password reset, sign-in links and the
 * OAuth (PKCE) callback. Turns the link into a session cookie, then continues to `next` (a local path only).
 * Handles both the default email templates (?code=, which must be opened in the browser that asked for it) and
 * templates that link here with ?token_hash=&type= (which work in any browser).
 *
 * A Google sign-in that was cancelled or failed comes back with ?error= (and error_description) instead of a
 * code. When it was on its way to /auth/continue, it goes there with error=cancelled or error=failed, so the
 * sign-in page says what happened; anything else is a link that didn't work.
 *
 * A link with none of these carries its session in the URL fragment instead (Supabase's default invitation
 * email, and invitations sent before they were redirected to /auth/callback). A fragment never reaches the
 * server, but the browser keeps it across a redirect, so it goes on to /auth/callback, which reads it in the
 * browser.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = localPath(params.get("next")) ?? "/";
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  /**
   * A failure, said the right way: a Google sign-in (bound for /auth/continue, not via an email link) goes back there with
   * our own word for what happened, so the page keeps its audience and next; anything else was a link that didn't work.
   */
  function fail(kind: "cancelled" | "failed"): never {
    const target = new URL(next, request.nextUrl.origin);
    if (target.pathname === "/auth/continue" && target.searchParams.get("via") !== "email") {
      // Only our own words go on: nothing from Supabase's error is passed to the page.
      target.searchParams.set("error", kind);
      redirect(`${target.pathname}${target.search}`);
    }
    redirect("/login?reason=link_invalid");
  }

  const error = params.get("error");
  if (error || params.has("error_description")) fail(error === "access_denied" ? "cancelled" : "failed");

  if (!code && !tokenHash) redirect(`/auth/callback${request.nextUrl.search}`);

  const supabase = await createServerSupabase();
  let ok = false;
  if (code) {
    const flowId = params.get("sb_flow_id");
    ok = !(await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  // A code that won't exchange (e.g. Google was finished in another browser, without this one's PKCE cookie) is a failed sign-in.
  if (!ok) fail("failed");
  redirect(next);
}
