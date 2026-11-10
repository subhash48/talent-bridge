import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AUDIENCE_EYEBROW, AuthCard, authLinkStyles } from "@/components/auth/AuthCard";
import { SignupForm } from "@/components/auth/SignupForm";
import { landingPath, localPath, loginPath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";

export const metadata: Metadata = { title: "Create account" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Candidates only. Employers set up their company's workspace at /signup/employer. ?next= is where to go once the
// account exists, e.g. the job they were applying for.
export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = localPath(typeof params.next === "string" ? params.next : null);
  const user = await getSignedInUser();
  if (user) redirect(landingPath(user.role, next, user.workspace?.mode));

  return (
    <AuthCard
      eyebrow={AUDIENCE_EYEBROW.candidate}
      title="Create your account"
      description="Find opportunities and stay informed at every step."
      footer={
        <>
          <p>
            Already have an account?{" "}
            <Link href={loginPath({ audience: "candidate", next })} className={authLinkStyles}>
              Sign in
            </Link>
          </p>
          <p>
            Hiring?{" "}
            <Link href="/signup/employer" className={authLinkStyles}>
              Set up your company
            </Link>
          </p>
        </>
      }
    >
      <SignupForm next={next} />
    </AuthCard>
  );
}
