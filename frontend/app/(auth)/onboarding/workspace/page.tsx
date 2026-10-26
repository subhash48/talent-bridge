import type { Metadata } from "next";

import { WorkspaceSetupForm } from "@/components/auth/WorkspaceSetupForm";
import { NightSky } from "@/components/shared/NightSky";
import { TalentBridgeLogo } from "@/components/shared/TalentBridgeLogo";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Set up your workspace" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Where an employer's verification email lands, signed in: how they hire, and their company. The API makes the
// workspace only for a verified email, and never for a candidate's.
export default async function WorkspaceSetupPage({ searchParams }: Props) {
  const params = await searchParams;
  const mode = params.mode === "simple" || params.mode === "full" ? params.mode : null;
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <NightSky />
      <Card className="w-full max-w-xl p-6 sm:p-8">
        <TalentBridgeLogo />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">Set up your workspace</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-stone">
          Your company&apos;s own space on TalentBridge. Nobody else&apos;s applicants are ever in it.
        </p>
        <div className="mt-7">
          <WorkspaceSetupForm initialMode={mode} />
        </div>
      </Card>
    </main>
  );
}
