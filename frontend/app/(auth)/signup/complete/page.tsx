import type { Metadata } from "next";

import { AUDIENCE_EYEBROW, AuthCard } from "@/components/auth/AuthCard";
import { CompleteCandidateSignup } from "@/components/auth/CompleteCandidateSignup";
import { localPath } from "@/lib/auth";

export const metadata: Metadata = { title: "Setting up your account" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Where a candidate's verification email lands (see SignupForm), and a first Google sign-in (/auth/continue): the
// session is already set by /auth/confirm. ?next= is where to go after, checked again before it's followed.
export default async function CompleteSignupPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = localPath(typeof params.next === "string" ? params.next : null);
  return (
    <AuthCard
      eyebrow={AUDIENCE_EYEBROW.candidate}
      title="Setting up your account"
      description="One moment while we open your candidate portal."
    >
      <CompleteCandidateSignup next={next} />
    </AuthCard>
  );
}
