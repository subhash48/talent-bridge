import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard, authLinkStyles } from "@/components/auth/AuthCard";
import { SignupForm } from "@/components/auth/SignupForm";
import { homePath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";

export const metadata: Metadata = { title: "Create your candidate account" };

// Candidates only. Employers set up their company's workspace at /signup/employer.
export default async function SignupPage() {
  const user = await getSignedInUser();
  if (user) redirect(homePath(user));

  return (
    <AuthCard
      title="Create your candidate account"
      description="Follow your applications, messages from hiring teams, interviews and preparation in one place."
      footer={
        <div className="flex flex-col gap-2">
          <span>
            Already have an account?{" "}
            <Link href="/login?as=candidate" className={authLinkStyles}>
              Sign in
            </Link>
          </span>
          <span>
            Hiring?{" "}
            <Link href="/signup/employer" className={authLinkStyles}>
              Create a company workspace
            </Link>
          </span>
        </div>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
