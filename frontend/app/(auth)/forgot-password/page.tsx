import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard, authLinkStyles } from "@/components/auth/AuthCard";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your account's email and we'll send you a link to choose a new password."
      footer={
        <Link href="/login" className={authLinkStyles}>
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
