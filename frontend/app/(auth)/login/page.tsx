import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginCard } from "@/components/auth/LoginCard";
import { LoginForm } from "@/components/auth/LoginForm";
import { landingPath, localPath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";
import { USE_MOCK_API } from "@/services/api";

export const metadata: Metadata = { title: "Sign in" };

type LoginPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;
  const reason = typeof params.reason === "string" ? params.reason : null;
  // Mock mode previews the workspace with fake data and no sign-in.
  if (USE_MOCK_API) redirect("/recruiter");
  // Already signed in with a working account: straight to their workspace.
  const user = await getSignedInUser();
  if (user) redirect(landingPath(user.role, next));

  return (
    <LoginCard
      title="Welcome back"
      description="Sign in to your hiring workspace or candidate portal."
      footer={
        <>
          <p className="text-[13px] text-stone">Applied for a role?</p>
          <Link
            href="/signup"
            className="mt-0.5 inline-flex items-center gap-2 rounded-md text-[15px] text-ink underline-offset-4 hover:underline"
          >
            Create your candidate account <ArrowRight aria-hidden className="size-4" />
          </Link>
        </>
      }
    >
      <LoginForm next={localPath(next)} reason={reason} />
    </LoginCard>
  );
}
