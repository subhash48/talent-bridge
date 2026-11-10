import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AUDIENCE_EYEBROW, authLinkStyles } from "@/components/auth/AuthCard";
import { LoginCard } from "@/components/auth/LoginCard";
import { LoginForm, type Audience } from "@/components/auth/LoginForm";
import { landingPath, localPath, loginPath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";
import { USE_MOCK_API } from "@/services/api";

export const metadata: Metadata = { title: "Sign in" };

type LoginPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type Copy = { eyebrow?: string; title: string; description: string };

const COPY: Record<Audience | "anyone", Copy> = {
  candidate: {
    eyebrow: AUDIENCE_EYEBROW.candidate,
    title: "Sign in to Hirvello",
    description: "Track your applications, messages, and interviews.",
  },
  employer: {
    eyebrow: AUDIENCE_EYEBROW.employer,
    title: "Sign in to your workspace",
    description: "Open your company's hiring workspace or Simple Hire.",
  },
  anyone: {
    title: "Sign in to Hirvello",
    description: "Open your hiring workspace or your candidate portal.",
  },
};

/** "Lead? Link" on one line of the card's footer. */
function FooterLine({ lead, href, link }: { lead: string; href: string; link: string }) {
  return (
    <p>
      {lead}{" "}
      <Link href={href} className={authLinkStyles}>
        {link}
      </Link>
    </p>
  );
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = localPath(typeof params.next === "string" ? params.next : null);
  const reason = typeof params.reason === "string" ? params.reason : null;
  const audience: Audience | null = params.as === "candidate" || params.as === "employer" ? params.as : null;
  // Mock mode previews the workspace with fake data and no sign-in.
  if (USE_MOCK_API) redirect("/recruiter");
  // Already signed in with a working account: straight to their workspace.
  const user = await getSignedInUser();
  if (user) redirect(landingPath(user.role, next, user.workspace?.mode));
  const copy = COPY[audience ?? "anyone"];
  // Making an account keeps where they were going; an employer's always starts with their company.
  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : "/signup";

  return (
    <LoginCard
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      footer={
        audience === "employer" ? (
          <>
            <FooterLine lead="New to Hirvello?" href="/signup/employer" link="Set up your company" />
            <FooterLine lead="Looking for work?" href={loginPath({ audience: "candidate", next })} link="Candidate sign in" />
          </>
        ) : (
          <>
            <FooterLine lead="New to Hirvello?" href={signupHref} link="Create an account" />
            <FooterLine lead="Hiring?" href={loginPath({ audience: "employer", next })} link="Employer sign in" />
          </>
        )
      }
    >
      <LoginForm next={next} reason={reason} audience={audience} emailLink={audience !== "candidate"} />
    </LoginCard>
  );
}
