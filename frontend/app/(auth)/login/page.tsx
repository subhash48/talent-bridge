import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginCard } from "@/components/auth/LoginCard";
import { LoginForm, type Audience } from "@/components/auth/LoginForm";
import { landingPath, localPath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";
import { USE_MOCK_API } from "@/services/api";

export const metadata: Metadata = { title: "Sign in" };

type LoginPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const COPY: Record<
  Audience | "anyone",
  { title: string; description: string; lead: string; link: string; href: string }
> = {
  candidate: {
    title: "Candidate sign in",
    description: "Follow your applications, messages from hiring teams and interviews.",
    lead: "New to TalentBridge?",
    link: "Create your candidate account",
    href: "/signup",
  },
  employer: {
    title: "Employer sign in",
    description: "Open your company's hiring workspace or Simple Hire.",
    lead: "Hiring for a company that isn't on TalentBridge yet?",
    link: "Create a company workspace",
    href: "/signup/employer",
  },
  anyone: {
    title: "Welcome back",
    description: "Sign in to your hiring workspace or candidate portal.",
    lead: "Applied for a role?",
    link: "Create your candidate account",
    href: "/signup",
  },
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;
  const reason = typeof params.reason === "string" ? params.reason : null;
  const audience: Audience | null = params.as === "candidate" || params.as === "employer" ? params.as : null;
  // Mock mode previews the workspace with fake data and no sign-in.
  if (USE_MOCK_API) redirect("/recruiter");
  // Already signed in with a working account: straight to their workspace.
  const user = await getSignedInUser();
  if (user) redirect(landingPath(user.role, next, user.workspace?.mode));
  const copy = COPY[audience ?? "anyone"];

  return (
    <LoginCard
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <p className="text-[13px] text-stone">{copy.lead}</p>
          <Link
            href={copy.href}
            className="mt-0.5 inline-flex items-center gap-2 rounded-md text-[15px] text-brand-ink underline-offset-4 hover:text-ink hover:underline"
          >
            {copy.link} <ArrowRight aria-hidden className="size-4" />
          </Link>
          {audience && (
            <p className="mt-3 text-[13px] text-stone">
              <Link
                href={audience === "candidate" ? "/login?as=employer" : "/login?as=candidate"}
                className="underline-offset-4 hover:text-ink hover:underline"
              >
                {audience === "candidate" ? "Hiring? Employer sign in" : "Applying for a job? Candidate sign in"}
              </Link>
            </p>
          )}
        </>
      }
    >
      <LoginForm next={localPath(next)} reason={reason} audience={audience} />
    </LoginCard>
  );
}
