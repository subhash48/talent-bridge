import "server-only";

import { redirect } from "next/navigation";

import { homePath, type Role } from "@/lib/auth";
import { getServerAccessToken } from "@/lib/supabase-server";
import { ApiError, USE_MOCK_API } from "@/services/api";
import { getCurrentUser } from "@/services/me";
import type { CurrentUser, WorkspaceMode } from "@/types/workspace";

// Server-side access checks for layouts and pages. They ask the API who is signed in (GET /me), so the
// role always comes from the database, and redirect before anything protected renders. The API
// enforces the same rules on every request; these only decide what to show.

/** The signed-in user, or a redirect to /login when there's no session or the API won't accept it. */
export async function requireUser(): Promise<CurrentUser> {
  if (USE_MOCK_API) return getCurrentUser();
  if (!(await getServerAccessToken())) redirect("/login");
  try {
    return await getCurrentUser();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login?reason=expired");
    if (error instanceof ApiError && error.status === 403) redirect(`/login?reason=${error.code}`);
    throw error;
  }
}

/** The signed-in user if their role may see this area; anyone else is sent to their own home. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(homePath(user));
  return user;
}

/** The signed-in user, or null (signed out, not linked, or the API is unreachable). Never redirects. */
export async function getSignedInUser(): Promise<CurrentUser | null> {
  if (USE_MOCK_API || !(await getServerAccessToken())) return null;
  return getCurrentUser().catch(() => null);
}

/**
 * A recruiter or admin, in the interface their workspace hires with: Simple Hire's owners are sent from the
 * full workspace to /hire, and recruiting teams from /hire to /recruiter. Only what they see differs; the API
 * scopes their data to their company either way.
 */
export async function requireWorkspace(mode: WorkspaceMode): Promise<CurrentUser> {
  const user = await requireRole("recruiter", "admin");
  if ((user.workspace?.mode ?? "full") !== mode) redirect(homePath(user));
  return user;
}
