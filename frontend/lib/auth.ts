import type { Role } from "@/types/candidate";
import type { WorkspaceMode } from "@/types/workspace";

export type { Role };

/**
 * Where each person lands after signing in: candidates in their portal; recruiters and admins in their
 * company's workspace, the full one or Simple Hire, by how it hires.
 */
export function roleHomePath(role: Role, mode?: WorkspaceMode | null): string {
  if (role === "candidate") return "/candidate";
  return mode === "simple" ? "/hire" : "/recruiter";
}

/** The same, for a signed-in user from /me. */
export function homePath(user: { role: Role; workspace?: { mode: WorkspaceMode } | null }): string {
  return roleHomePath(user.role, user.workspace?.mode);
}

const SITE = "http://hirvello.invalid";

/**
 * A local path from a query parameter, or null for anything that could lead off the site. Browsers drop tabs
 * and line breaks from a URL and read a backslash as a slash, so "/<tab>/evil.example" would go to
 * evil.example: those are refused outright, and what's left must stay on this site when resolved.
 */
export function localPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    return new URL(value, SITE).origin === SITE ? value : null;
  } catch {
    return null;
  }
}

/** True for `prefix` itself and anything under it ("/jobs", "/jobs/1", "/jobs?q=x"), but not "/jobsearch". */
function within(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * After signing in: the page they were sent away from if it's in their own area, else their home. Candidates may
 * also go back to the public job board (/jobs and its pages), where they were applying. The path is resolved
 * first, so "/jobs/../recruiter" counts as the /recruiter it really opens, and the resolved form is what's used.
 */
export function landingPath(role: Role, next?: string | null, mode?: WorkspaceMode | null): string {
  const home = roleHomePath(role, mode);
  const path = localPath(next);
  if (!path) return home;
  const url = new URL(path, SITE);
  const allowed = within(url.pathname, home) || (role === "candidate" && within(url.pathname, "/jobs"));
  return allowed ? `${url.pathname}${url.search}${url.hash}` : home;
}

/** Who a sign-in page is for: a candidate, or someone who hires. Unset, it takes either. */
export type Audience = "candidate" | "employer";
/** Whether a Google sign-in started from a sign-in page or from making an account. */
export type AuthIntent = "signin" | "signup";

/**
 * Where a Google sign-in (or an emailed link) comes back to once Supabase has the session: /auth/continue, told who
 * the page was for, whether they were signing in or making an account, the workspace mode they picked (employers)
 * and where to go after (a local path only).
 */
export function authContinuePath({
  audience,
  intent,
  mode,
  next,
  via,
}: {
  audience: Audience | null;
  intent: AuthIntent;
  mode?: WorkspaceMode | null;
  next?: string | null;
  /** "email" for an emailed link (sign-in link, verification resent), so a failure isn't called a Google one. */
  via?: "email";
}): string {
  const params = new URLSearchParams();
  if (audience) params.set("as", audience);
  params.set("intent", intent);
  if (mode) params.set("mode", mode);
  const path = localPath(next);
  if (path) params.set("next", path);
  if (via) params.set("via", via);
  return `/auth/continue?${params}`;
}

/**
 * The cookie that remembers where a Google sign-in or an emailed link was going. Supabase sends people back to its
 * Site URL (our home page) instead of the address we asked for when that address isn't on its Redirect URLs list,
 * for example www.hirvello.com when only hirvello.com is listed; the home page then hands the code on to
 * /auth/confirm (proxy.ts), which reads this to finish the trip where it started.
 */
export const AUTH_NEXT_COOKIE = "hirvello_auth_next";

/**
 * The address Supabase should send someone back to once it has their session: /auth/confirm on this site, which
 * goes on to `next`. Called in the browser just before leaving for Google or sending an email, and remembers `next`
 * for 15 minutes in case Supabase sends them to the home page instead.
 */
export function authRedirectUrl(next: string): string {
  const path = localPath(next) ?? "/";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AUTH_NEXT_COOKIE}=${encodeURIComponent(path)}; Path=/; Max-Age=900; SameSite=Lax${secure}`;
  return `${window.location.origin}/auth/confirm?next=${encodeURIComponent(path)}`;
}

/** /login for this audience, with a reason to show and the page to return to; every part is optional. */
export function loginPath({ audience, reason, next }: { audience?: Audience | null; reason?: string | null; next?: string | null }) {
  const params = new URLSearchParams();
  if (audience) params.set("as", audience);
  if (reason) params.set("reason", reason);
  const path = localPath(next);
  if (path) params.set("next", path);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

/** /signup/complete, carrying the page to open once the candidate account exists. */
export function candidateCompletePath(next?: string | null): string {
  const path = localPath(next);
  return path ? `/signup/complete?next=${encodeURIComponent(path)}` : "/signup/complete";
}

/**
 * A full name as the account API wants it: the first word is the first name, the rest the last name. Null when
 * there aren't two words, so the person is asked for both. Each part is capped at the API's 100 characters.
 */
export function splitFullName(fullName: string | null | undefined): { firstName: string; lastName: string } | null {
  const words = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  const firstName = words[0];
  const lastName = words.slice(1).join(" ");
  return firstName.length <= 100 && lastName.length <= 100 ? { firstName, lastName } : null;
}

/** What to tell the person when Supabase Auth refuses a request. Never says whether an email has an account. */
export function authErrorMessage(error: { code?: string; message?: string; name?: string }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password don't match. Check them and try again.";
    case "email_not_confirmed":
      return "Verify your email first: open the link we sent you, then sign in.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Wait a minute, then try again.";
    case "same_password":
      return "Choose a password that's different from your current one.";
    case "weak_password":
      return error.message || "Choose a stronger password.";
    case "signup_disabled":
      return "New accounts can't be created right now. Contact the hiring team.";
  }
  if (error.name === "AuthRetryableFetchError") return "Can't reach the sign-in service. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

/** Why someone was sent to /login (the reason query parameter), in their words. */
export const LOGIN_NOTICES: Record<string, string> = {
  expired: "Your session has ended. Sign in again to continue.",
  account_not_linked:
    "This account isn't linked to Hirvello yet. Sign in with the email you applied with, or contact the hiring team.",
  account_disabled: "This account has been disabled. Contact the hiring team if you think this is a mistake.",
  account_mismatch:
    "This sign-in doesn't match the email on your candidate record. Sign in with the email you applied with, or contact the hiring team.",
  link_invalid: "That link is invalid or has expired. Sign in, or request a new one.",
  google_cancelled: "Google sign-in was cancelled. Try again, or use your email and password.",
  google_failed: "We couldn't sign you in with Google. Try again, or use your email and password.",
  wrong_account: "That account is for a different part of Hirvello. Sign in with the account you use here.",
  signed_out: "You've signed out.",
};
