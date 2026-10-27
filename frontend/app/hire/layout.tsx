import type { Metadata, Viewport } from "next";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { HireShell } from "@/components/hire/HireShell";
import { WorkspaceProvider } from "@/components/recruiter/WorkspaceProvider";
import { ApiUnavailable } from "@/components/shared/ApiUnavailable";
import { SessionWatcher } from "@/components/shared/SessionWatcher";
import { requireWorkspace } from "@/lib/session";
import { errorMessage, isServerUnavailable } from "@/services/api";
import { getCandidates } from "@/services/candidates";
import { getEmailDelivery } from "@/services/communication";
import { getJobs } from "@/services/jobs";
import { getUnreadThreadCount } from "@/services/messages";

export const metadata: Metadata = { title: { default: "Simple Hire", template: "%s · Simple Hire" } };

// The portals keep the cream canvas, so the browser's toolbar matches them rather than the website's sky.
export const viewport: Viewport = { themeColor: "#F2EDE3" };

// Simple Hire: the same workspace data and services as the full recruiter workspace (WorkspaceProvider), in
// a few large pages. Recruiting teams on the full workspace are sent to /recruiter.
export default async function HireLayout({ children }: { children: ReactNode }) {
  await connection();
  const workspace = await loadWorkspace().catch((error: unknown) => {
    unstable_rethrow(error); // redirects to /login, the candidate portal or the full workspace
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
      <HireShell>{children}</HireShell>
    </WorkspaceProvider>
  );
}

async function loadWorkspace() {
  const user = await requireWorkspace("simple");
  const email = getEmailDelivery().catch(() => ({ configured: false }));
  return [user, ...(await Promise.all([getCandidates(), getJobs(), getUnreadThreadCount(), email]))] as const;
}
