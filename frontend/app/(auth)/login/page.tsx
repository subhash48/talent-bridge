import Link from "next/link";

import { EncordLogo } from "@/components/shared/EncordLogo";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

// TODO: Supabase Auth sign-in form (ARCHITECTURE.md 10.1). Preview links keep the app navigable.
export default function LoginPage() {
  return (
    <main className="app-backdrop flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm p-8">
        <EncordLogo />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-ink">Welcome back</h1>
        <p className="mt-1.5 text-sm text-stone">Sign-in is coming soon. Choose a workspace to preview.</p>
        <div className="mt-8 flex flex-col gap-2">
          <Link href="/recruiter/candidates" className={buttonStyles({ size: "lg" })}>
            Recruiter workspace
          </Link>
          <Link href="/candidate" className={buttonStyles({ variant: "secondary", size: "lg" })}>
            Candidate portal
          </Link>
        </div>
      </Card>
    </main>
  );
}
