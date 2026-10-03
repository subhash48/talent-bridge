import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { CandidatePortalProvider } from "@/components/candidate/CandidatePortalProvider";
import { CandidateShell } from "@/components/candidate/CandidateShell";
import { ApiUnavailable } from "@/components/shared/ApiUnavailable";
import { errorMessage } from "@/services/api";
import { getCandidateMe } from "@/services/portal";

export const metadata: Metadata = {
  title: { default: "Candidate portal", template: "%s · Encord Candidate Portal" },
  description: "Follow your application, interviews and messages with the Encord hiring team.",
};

// The Candidate Portal. It reads the same records as the recruiter workspace through /candidate/*,
// so a change on either side shows on the other. Who is signed in is decided by the API.
export default async function CandidateLayout({ children }: { children: ReactNode }) {
  // Rendered per request: the application, interviews and messages must be current.
  await connection();
  const me = await getCandidateMe().catch((error: unknown) => ({ error: errorMessage(error) }));
  if ("error" in me) return <ApiUnavailable title="Your candidate portal can't load right now" message={me.error} />;

  return (
    <CandidatePortalProvider initialMe={me}>
      <CandidateShell>{children}</CandidateShell>
    </CandidatePortalProvider>
  );
}
