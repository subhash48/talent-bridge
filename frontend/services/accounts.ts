import { apiFetch } from "@/services/api";
import { toCurrentUser } from "@/services/me";
import type { ApiUser } from "@/types/api";
import type { CurrentUser, WorkspaceMode } from "@/types/workspace";

// Accounts people make for themselves (backend /accounts): a candidate account, or an employer's workspace.
// Signed in with Supabase Auth, which keeps the password and verified the email; the API only says what the
// sign-in is in Kavuntra, and creates nothing until the email is verified.

export type AccountStatus = {
  email: string | null;
  emailVerified: boolean;
  /** candidate: a candidate portal; staff: an employer's workspace; none: nothing yet. */
  account: "candidate" | "staff" | "none";
  workspaceMode: WorkspaceMode | null;
};

type ApiAccountStatus = {
  email: string | null;
  email_verified: boolean;
  account: AccountStatus["account"];
  workspace_mode: WorkspaceMode | null;
};

export async function getAccountStatus(): Promise<AccountStatus> {
  const status = await apiFetch<ApiAccountStatus>("/accounts/status");
  return {
    email: status.email,
    emailVerified: status.email_verified,
    account: status.account,
    workspaceMode: status.workspace_mode,
  };
}

/** The signed-in person's candidate account; any applications made with their email are in it at once. */
export async function createCandidateAccount(name: { firstName: string; lastName: string }): Promise<CurrentUser> {
  const user = await apiFetch<ApiUser>("/accounts/candidate", {
    method: "POST",
    body: JSON.stringify({ first_name: name.firstName.trim(), last_name: name.lastName.trim() }),
  });
  return toCurrentUser(user);
}

export type WorkspaceSetup = { fullName: string; companyName: string; mode: WorkspaceMode; location: string };

/** A new company workspace, in the mode chosen, with the signed-in person as its admin. */
export async function createWorkspace(setup: WorkspaceSetup): Promise<CurrentUser> {
  const user = await apiFetch<ApiUser>("/accounts/workspace", {
    method: "POST",
    body: JSON.stringify({
      full_name: setup.fullName.trim(),
      company_name: setup.companyName.trim(),
      mode: setup.mode,
      location: setup.location.trim() || null,
    }),
  });
  return toCurrentUser(user);
}
