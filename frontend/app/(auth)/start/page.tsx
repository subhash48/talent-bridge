import { ArrowRight, Store, UserRound, Users, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { KavuntraLogo } from "@/components/shared/KavuntraLogo";
import { homePath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Get started" };

// Who it's for decides which account is made, so Get started asks first. Each is one card over the valley.
const ROLES: { href: string; icon: LucideIcon; tile: string; title: string; text: string; action: string }[] = [
  {
    href: "/signup",
    icon: UserRound,
    tile: "bg-[#dce5cf]",
    title: "Candidate",
    text: "Track your applications and stay informed.",
    action: "Continue as Candidate",
  },
  {
    href: "/signup/employer?mode=full",
    icon: Users,
    tile: "bg-[#dbe3ea]",
    title: "Recruiter",
    text: "Manage candidates and hire faster.",
    action: "Continue as Recruiter",
  },
  {
    href: "/signup/employer?mode=simple",
    icon: Store,
    tile: "bg-[#f1e6d3]",
    title: "Small Business",
    text: "Post jobs and find great talent.",
    action: "Continue as Small Business",
  },
];

// Tinted glass over the landscape: a deep teal tint the valley shows through, with a hairline of light at its edge.
const CARD =
  "bg-[rgb(32_58_55/0.34)] ring-1 ring-[rgb(235_239_226/0.28)] shadow-[0_12px_35px_rgb(16_40_44/0.22)] backdrop-blur-[14px]";

/**
 * The website's Get started: one still of the valley, the mark, and three cards of the same size, one per way of
 * using Kavuntra. The whole card is the link; the arrow at its foot only shows where it leads.
 */
export default async function GetStartedPage() {
  const user = await getSignedInUser();
  if (user) redirect(homePath(user));

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-[#c9c6b3]">
        <picture>
          <source media="(max-aspect-ratio: 20/21)" srcSet="/hero/mobile/01.webp" />
          <img src="/hero/desktop/01.webp" alt="" fetchPriority="high" className="absolute inset-0 size-full object-cover" />
        </picture>
        <div className="sky-grade absolute inset-0" />
      </div>

      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col items-center justify-center px-5 py-10 text-center sm:px-8">
        <Link href="/" aria-label="Kavuntra home" className="rounded-md">
          <KavuntraLogo className="gap-3 [&>svg:first-child]:h-8 [&>svg:last-child]:h-[14px]" />
        </Link>
        <h1 className="mt-9 text-[clamp(36px,4.4vw,60px)] leading-[1.05] font-semibold tracking-[-0.035em] text-[#10282b]">
          Let&rsquo;s get started
        </h1>
        <p className="mt-3 text-[clamp(16px,1.3vw,20px)] leading-relaxed text-[#2b4044]">Choose how you want to use Kavuntra</p>

        <ul className="mt-10 grid w-full max-w-[960px] grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6">
          {ROLES.map(({ href, icon: Icon, tile, title, text, action }) => (
            <li key={href} className="flex">
              <Link
                href={href}
                className={cn(
                  "group flex w-full flex-col items-center rounded-[22px] px-6 pt-9 pb-7 text-center sm:min-h-[280px]",
                  CARD,
                )}
              >
                <span className={cn("flex size-[72px] items-center justify-center rounded-full text-brand-deep", tile)}>
                  <Icon aria-hidden className="size-8" strokeWidth={1.6} />
                </span>
                <span className="mt-6 text-[24px] leading-tight font-semibold tracking-[-0.02em] text-on-brand">{title}</span>
                <span className="mt-2 max-w-[22ch] text-[15px] leading-snug text-on-brand/85">{text}</span>
                <span className="mt-auto flex pt-7">
                  <span className="flex size-12 items-center justify-center rounded-full bg-brand text-on-brand shadow-raised transition-transform duration-200 group-hover:translate-x-0.5">
                    <ArrowRight aria-hidden className="size-5" />
                    <span className="sr-only">{action}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className={cn("mt-9 rounded-full px-5 py-2.5 text-[15px] text-on-brand", CARD)}>
          Already have an account?{" "}
          <Link href="/signin" className="font-medium underline underline-offset-4 transition-colors hover:text-overlay">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
