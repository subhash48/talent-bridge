import type { Viewport } from "next";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { RecruiterShell } from "@/components/recruiter/RecruiterShell";
import { WorkspaceProvider } from "@/components/recruiter/WorkspaceProvider";
import { ApiUnavailable } from "@/components/shared/ApiUnavailable";
import { SessionWatcher } from "@/components/shared/SessionWatcher";
import { requireWorkspace } from "@/lib/session";
import { errorMessage, isServerUnavailable } from "@/services/api";
import { getCandidates } from "@/services/candidates";
import { getEmailDelivery } from "@/services/communication";
import { getJobs } from "@/services/jobs";
import { getUnreadThreadCount } from "@/services/messages";

// RecruiterShell (ARCHITECTURE.md 12.1). The candidate list is loaded once here and shared by every
// recruiter page, so changes made on the dashboard are still there after navigating to Jobs and back.
// The portals keep the cream canvas, so the browser's toolbar matches them rather than the website's sky.
export const viewport: Viewport = { themeColor: "#F2EDE3" };

export default async function RecruiterLayout({ children }: { children: ReactNode }) {
  // Rendered per request: data and relative times must be current, never baked in at build time.
  await connection();
  const workspace = await loadWorkspace().catch((error: unknown) => {
    unstable_rethrow(error); // redirects to /login or the candidate portal
    return { error: errorMessage(error), serverDown: isServerUnavailable(error) };
  });
  if ("error" in workspace) return <ApiUnavailable message={workspace.error} serverDown={workspace.serverDown} />;

  const [user, candidates, jobs, unreadThreads, email] = workspace;
  return (
    <WorkspaceProvider
      user={user}
      initialCandidates={candidates}
      initialJobs={jobs}
      initialUnreadThreads={unreadThreads}
      emailConfigured={email.configured}
    >
      <SessionWatcher />
      <RecruiterShell>{children}</RecruiterShell>
    </WorkspaceProvider>
  );
}

async function loadWorkspace() {
  // Recruiters and admins of a full workspace (Simple Hire's go to /hire); the role and the workspace's mode
  // come from the API before any workspace data is loaded.
  const user = await requireWorkspace("full");
  const email = getEmailDelivery().catch(() => ({ configured: false })); // optional: portal delivery works without it
  return [user, ...(await Promise.all([getCandidates(), getJobs(), getUnreadThreadCount(), email]))] as const;
}
