import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { RecruiterShell } from "@/components/recruiter/RecruiterShell";
import { WorkspaceProvider } from "@/components/recruiter/WorkspaceProvider";
import { ApiUnavailable } from "@/components/shared/ApiUnavailable";
import { SessionWatcher } from "@/components/shared/SessionWatcher";
import { requireRole } from "@/lib/session";
import { errorMessage } from "@/services/api";
import { getCandidates } from "@/services/candidates";
import { getJobs } from "@/services/jobs";
import { getUnreadThreadCount } from "@/services/messages";

// RecruiterShell (ARCHITECTURE.md 12.1). The candidate list is loaded once here and shared by every
// recruiter page, so changes made on the dashboard are still there after navigating to Jobs and back.
export default async function RecruiterLayout({ children }: { children: ReactNode }) {
  // Rendered per request: data and relative times must be current, never baked in at build time.
  await connection();
  const workspace = await loadWorkspace().catch((error: unknown) => {
    unstable_rethrow(error); // redirects to /login or the candidate portal
    return { error: errorMessage(error) };
  });
  if ("error" in workspace) return <ApiUnavailable message={workspace.error} />;

  const [user, candidates, jobs, unreadThreads] = workspace;
  return (
    <WorkspaceProvider user={user} initialCandidates={candidates} initialJobs={jobs} initialUnreadThreads={unreadThreads}>
      <SessionWatcher />
      <RecruiterShell>{children}</RecruiterShell>
    </WorkspaceProvider>
  );
}

async function loadWorkspace() {
  // Recruiters and admins only; the role comes from the API before any workspace data is loaded.
  const user = await requireRole("recruiter", "admin");
  return [user, ...(await Promise.all([getCandidates(), getJobs(), getUnreadThreadCount()]))] as const;
}
