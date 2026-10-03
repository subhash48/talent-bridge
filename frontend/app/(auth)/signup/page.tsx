import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard, authLinkStyles } from "@/components/auth/AuthCard";
import { SignupForm } from "@/components/auth/SignupForm";
import { roleHomePath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";

export const metadata: Metadata = { title: "Create your account" };

// Candidates only. Hiring team accounts are set up by an administrator (see README), never here.
export default async function SignupPage() {
  const user = await getSignedInUser();
  if (user) redirect(roleHomePath(user.role));

  return (
    <AuthCard
      title="Create your candidate account"
      description="Use the email address you applied with. Once you verify it, your account opens your application."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className={authLinkStyles}>
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
