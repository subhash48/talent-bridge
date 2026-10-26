import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard, authLinkStyles } from "@/components/auth/AuthCard";
import { EmployerSignupForm } from "@/components/auth/EmployerSignupForm";
import { homePath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";

export const metadata: Metadata = { title: "Set up your company" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Employers only: their company's workspace, in the full recruiting workspace or Simple Hire (?mode=, from the
// website's buttons; chosen again on the next step). Candidates make their account at /signup.
export default async function EmployerSignupPage({ searchParams }: Props) {
  const params = await searchParams;
  const mode = params.mode === "simple" || params.mode === "full" ? params.mode : null;
  const user = await getSignedInUser();
  if (user) redirect(homePath(user));

  return (
    <AuthCard
      title={mode === "simple" ? "Start hiring with Simple Hire" : "Set up your company"}
      description={
        mode === "simple"
          ? "Post jobs, see who applied and contact them, by saying what you need."
          : "Create your sign-in, then tell us how your company hires."
      }
      footer={
        <div className="flex flex-col gap-2">
          <span>
            Already set up?{" "}
            <Link href="/login?as=employer" className={authLinkStyles}>
              Employer sign in
            </Link>
          </span>
          <span>
            Looking for a job?{" "}
            <Link href="/signup" className={authLinkStyles}>
              Create a candidate account
            </Link>
          </span>
        </div>
      }
    >
      <EmployerSignupForm mode={mode} />
    </AuthCard>
  );
}
