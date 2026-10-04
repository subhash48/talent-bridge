import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { localPath } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase-server";

/**
 * Where Supabase's emails land: sign-up confirmation and password reset. Turns the link into a
 * session cookie, then continues to `next` (a local path only). Handles both the default email
 * templates (?code=, which must be opened in the browser that asked for it) and templates that link
 * here with ?token_hash=&type= (which work in any browser).
 *
 * A link with neither carries its session in the URL fragment instead (Supabase's default invitation
 * email, and invitations sent before they were redirected to /auth/callback). A fragment never reaches
 * the server, but the browser keeps it across a redirect, so it goes on to /auth/callback, which reads
 * it in the browser.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = localPath(params.get("next")) ?? "/";
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  if (!code && !tokenHash) redirect(`/auth/callback${request.nextUrl.search}`);

  const supabase = await createServerSupabase();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  redirect(ok ? next : "/login?reason=link_invalid");
}
