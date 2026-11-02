import Link from "next/link";

import { HirvelloMark } from "@/components/shared/HirvelloLogo";
import { buttonStyles } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="sky-backdrop flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <HirvelloMark className="h-12" />
      <p className="mt-10 text-[12px] font-semibold tracking-[0.18em] text-faint uppercase">404</p>
      <h1 className="mt-3 text-[clamp(28px,4vw,40px)] font-medium tracking-[-0.035em] text-ink">This page doesn&apos;t exist</h1>
      <p className="mt-3 max-w-sm text-charcoal">The link may be out of date, or the record may have been removed.</p>
      <Link href="/" className={buttonStyles({ variant: "secondary", size: "lg", className: "mt-9 px-5" })}>
        Back to Hirvello
      </Link>
    </main>
  );
}
