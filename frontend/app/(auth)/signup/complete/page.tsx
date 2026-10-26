import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/AuthCard";
import { CompleteCandidateSignup } from "@/components/auth/CompleteCandidateSignup";

export const metadata: Metadata = { title: "Setting up your account" };

// Where a candidate's verification email lands (see SignupForm): the session is already set by /auth/confirm.
export default function CompleteSignupPage() {
  return (
    <AuthCard title="Setting up your account" description="One moment while we open your candidate portal.">
      <CompleteCandidateSignup />
    </AuthCard>
  );
}
