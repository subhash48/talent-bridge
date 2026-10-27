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

const SITE = "http://kavuntra.invalid";

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

/** After signing in: the page they were sent away from if it's in their own area, else their home. */
export function landingPath(role: Role, next?: string | null, mode?: WorkspaceMode | null): string {
  const home = roleHomePath(role, mode);
  const path = localPath(next);
  return path && (path === home || path.startsWith(`${home}/`) || path.startsWith(`${home}?`)) ? path : home;
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
    "This account isn't linked to Kavuntra yet. Sign in with the email you applied with, or contact the hiring team.",
  account_disabled: "This account has been disabled. Contact the hiring team if you think this is a mistake.",
  account_mismatch:
    "This sign-in doesn't match the email on your candidate record. Sign in with the email you applied with, or contact the hiring team.",
  link_invalid: "That link is invalid or has expired. Sign in, or request a new link.",
};
