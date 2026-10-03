import Link from "next/link";

import { Card } from "@/components/ui/Card";

const linkClass =
  "rounded-[10px] border border-border bg-surface-raised px-4 py-2.5 text-center text-sm font-medium text-ink shadow-soft transition hover:shadow-raised";

// TODO: Supabase Auth sign-in form (ARCHITECTURE.md 10.1). Preview links keep the starter navigable.
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="font-display text-4xl text-ink">HireMesh</h1>
        <p className="mt-2 text-sm text-stone">Sign in to continue.</p>
        <div className="mt-8 flex flex-col gap-2">
          <Link href="/recruiter" className={linkClass}>
            Preview recruiter workspace
          </Link>
          <Link href="/candidate" className={linkClass}>
            Preview candidate portal
          </Link>
        </div>
      </Card>
    </main>
  );
}
