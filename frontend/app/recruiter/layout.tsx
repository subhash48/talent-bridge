import { connection } from "next/server";
import type { ReactNode } from "react";

import { RecruiterShell } from "@/components/recruiter/RecruiterShell";
import { WorkspaceProvider } from "@/components/recruiter/WorkspaceProvider";
import { getCandidates } from "@/services/candidates";
import { getCurrentUser } from "@/services/me";
import { getUnreadThreadCount } from "@/services/messages";

// RecruiterShell (ARCHITECTURE.md 12.1). The candidate list is loaded once here and shared by every
// recruiter page, so changes made on the dashboard are still there after navigating to Jobs and back.
export default async function RecruiterLayout({ children }: { children: ReactNode }) {
  // Rendered per request: data and relative times must be current, never baked in at build time.
  await connection();
  const [user, candidates, unreadThreads] = await Promise.all([getCurrentUser(), getCandidates(), getUnreadThreadCount()]);

  return (
    <WorkspaceProvider user={user} initialCandidates={candidates} initialUnreadThreads={unreadThreads}>
      <RecruiterShell>{children}</RecruiterShell>
    </WorkspaceProvider>
  );
}
