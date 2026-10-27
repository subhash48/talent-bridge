import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/AuthCard";
import { WorkspaceSetupForm } from "@/components/auth/WorkspaceSetupForm";

export const metadata: Metadata = { title: "Set up your workspace" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Where an employer's verification email lands, signed in: how they hire, and their company. The API makes the
// workspace only for a verified email, and never for a candidate's.
export default async function WorkspaceSetupPage({ searchParams }: Props) {
  const params = await searchParams;
  const mode = params.mode === "simple" || params.mode === "full" ? params.mode : null;
  return (
    <AuthCard
      wide
      title="Set up your workspace"
      description="Your company's own space on Kavuntra. Nobody else's applicants are ever in it."
    >
      <WorkspaceSetupForm initialMode={mode} />
    </AuthCard>
  );
}
