import type { Metadata } from "next";
import Link from "next/link";

import { AUDIENCE_EYEBROW, AuthCard, authLinkStyles } from "@/components/auth/AuthCard";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { localPath, loginPath } from "@/lib/auth";

export const metadata: Metadata = { title: "Reset your password" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Reached from a sign-in page, which passes who it was for (?as=) and where they were going (?next=), so "Back to
// sign in" returns to the same page.
export default async function ForgotPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const audience = params.as === "candidate" || params.as === "employer" ? params.as : null;
  const next = localPath(typeof params.next === "string" ? params.next : null);
  return (
    <AuthCard
      eyebrow={audience ? AUDIENCE_EYEBROW[audience] : undefined}
      title="Reset your password"
      description="Enter your account's email address and we'll send you a link to choose a new password."
      footer={
        <p>
          Remembered it?{" "}
          <Link href={loginPath({ audience, next })} className={authLinkStyles}>
            Back to sign in
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
