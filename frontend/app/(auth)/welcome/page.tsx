import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { AuthCard, authLinkStyles } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { buttonStyles } from "@/components/ui/Button";
import { LOGIN_NOTICES, roleHomePath } from "@/lib/auth";
import { getServerAccessToken } from "@/lib/supabase-server";
import { ApiError } from "@/services/api";
import { getCurrentUser } from "@/services/me";

export const metadata: Metadata = { title: "Set up your candidate portal" };

// Where a candidate portal invitation lands, once /auth/callback (Supabase's default invitation email)
// or /auth/confirm (a customised one) has turned the one-time link into a session. The API says whose
// account it is: only a candidate linked to this sign-in chooses a password here, and the page names
// the address it's for, so nobody sets up an account that isn't theirs without seeing it.
export default async function WelcomePage() {
  if (!(await getServerAccessToken())) return <InvitationExpired />;
  const user = await getCurrentUser().catch((error: unknown) => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return error;
    throw error;
  });
  if (user instanceof ApiError) {
    return user.status === 401 ? <InvitationExpired /> : <NotLinked code={user.code} />;
  }
  if (user.role !== "candidate") redirect(roleHomePath(user.role));

  return (
    <AuthCard
      title="Welcome to your candidate portal"
      description={
        <>
          Choose a password for <strong className="font-medium text-charcoal">{user.email}</strong>. You’ll sign in
          with it and this email.
        </>
      }
      footer={
        <Link href="/login" className={authLinkStyles}>
          Already set up? Sign in
        </Link>
      }
    >
      <ResetPasswordForm submitLabel="Set password and continue" redirectTo="/candidate" />
    </AuthCard>
  );
}

function InvitationExpired() {
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

// Signed in, but not as a candidate Talent Bridge knows. /login ends that session before anyone signs in.
function NotLinked({ code }: { code: string }) {
  const reason = code in LOGIN_NOTICES ? code : "account_not_linked";
  return (
    <AuthCard title="This invitation can’t be used here" description="It isn’t linked to a candidate record.">
      <div className="flex flex-col gap-4">
        <AuthAlert>{LOGIN_NOTICES[reason]}</AuthAlert>
        <Link href={`/login?reason=${reason}`} className={buttonStyles({ size: "lg", className: "w-full" })}>
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}
