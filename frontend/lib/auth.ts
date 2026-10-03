import type { Role } from "@/types/candidate";

export type { Role };

/** Where each role lands after signing in. Admins use the recruiter workspace until they have their own. */
export function roleHomePath(role: Role): string {
  return role === "candidate" ? "/candidate" : "/recruiter";
}

/** A local path from a query parameter, or null for anything that could lead off the site. */
export function localPath(value: string | null | undefined): string | null {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : null;
}

/** After signing in: the page they were sent away from if it's in their own area, else their home. */
export function landingPath(role: Role, next?: string | null): string {
  const home = roleHomePath(role);
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
    "This account isn't linked to Talent Bridge yet. Sign in with the email you applied with, or contact the hiring team.",
  account_disabled: "This account has been disabled. Contact the hiring team if you think this is a mistake.",
  link_invalid: "That link is invalid or has expired. Sign in, or request a new link.",
};
