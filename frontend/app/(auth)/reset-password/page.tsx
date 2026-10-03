import type { Metadata } from "next";
import Link from "next/link";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { AuthCard, authLinkStyles } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { buttonStyles } from "@/components/ui/Button";
import { getServerAccessToken } from "@/lib/supabase-server";

export const metadata: Metadata = { title: "Choose a new password" };

// Opened from the reset email: /auth/confirm has already exchanged the link for a session.
export default async function ResetPasswordPage() {
  if (!(await getServerAccessToken())) {
    return (
      <AuthCard title="This link has expired" description="Reset links work once and only for a short time.">
        <div className="flex flex-col gap-4">
          <AuthAlert tone="info">Request a new link and open it on this device.</AuthAlert>
          <Link href="/forgot-password" className={buttonStyles({ size: "lg", className: "w-full" })}>
            Send a new link
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      description="You'll stay signed in on this device."
      footer={
        <Link href="/login" className={authLinkStyles}>
          Back to sign in
        </Link>
      }
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
