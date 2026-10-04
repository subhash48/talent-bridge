import type { Metadata } from "next";
import Link from "next/link";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { AuthCard, authLinkStyles } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { buttonStyles } from "@/components/ui/Button";
import { getServerAccessToken } from "@/lib/supabase-server";

export const metadata: Metadata = { title: "Set up your candidate portal" };

// Where a candidate portal invitation lands: /auth/confirm has already turned the email's one-time
// link into a session, so all that's left is for the candidate to choose their own password.
export default async function WelcomePage() {
  if (!(await getServerAccessToken())) {
    return (
      <AuthCard title="This invitation link has expired" description="Invitation links work once and only for a while.">
        <div className="flex flex-col gap-4">
          <AuthAlert tone="info">Use “Forgot password” with the email you applied with to get a new link.</AuthAlert>
          <Link href="/forgot-password" className={buttonStyles({ size: "lg", className: "w-full" })}>
            Get a new link
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Welcome to your candidate portal"
      description="Choose a password to finish setting up. You’ll use it with the email you applied with."
      footer={
        <Link href="/login" className={authLinkStyles}>
          Already set up? Sign in
        </Link>
      }
    >
      <ResetPasswordForm submitLabel="Set password and continue" />
    </AuthCard>
  );
}
