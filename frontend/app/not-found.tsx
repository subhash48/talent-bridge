import Link from "next/link";

import { EncordMark } from "@/components/shared/EncordLogo";
import { buttonStyles } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="app-backdrop flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <EncordMark className="h-8 w-auto text-ink" />
      <p className="mt-8 text-sm text-stone">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">This page doesn&apos;t exist</h1>
      <p className="mt-2 max-w-sm text-stone">The link may be out of date, or the record may have been removed.</p>
      <Link href="/recruiter/candidates" className={buttonStyles({ variant: "secondary", className: "mt-8" })}>
        Back to candidates
      </Link>
    </main>
  );
}
