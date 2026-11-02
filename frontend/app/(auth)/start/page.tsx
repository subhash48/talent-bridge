import { ArrowRight, Store, UserRound, Users, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { HirvelloLogo } from "@/components/shared/HirvelloLogo";
import { homePath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Get started" };

// Who it's for decides which account is made, so Get started asks first. Each is one card of glass on the sky.
const ROLES: { href: string; icon: LucideIcon; title: string; text: string; action: string; simple?: boolean }[] = [
  {
    href: "/signup",
    icon: UserRound,
    title: "Candidate",
    text: "Track your applications and stay informed.",
    action: "Continue as Candidate",
  },
  {
    href: "/signup/employer?mode=full",
    icon: Users,
    title: "Recruiter",
    text: "Manage candidates and hire faster.",
    action: "Continue as Recruiter",
  },
  {
    href: "/signup/employer?mode=simple",
    icon: Store,
    title: "Small Business",
    text: "Post jobs and find great talent.",
    action: "Continue as Small Business",
    simple: true,
  },
];

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The website's Get started: the sky, the mark, and three cards of the same size, one per way of using Hirvello.
 * The whole card is the link; the arrow at its foot only shows where it leads. Arriving from the home page's
 * concierge with what you need (?need=), the page says so and points at Simple Hire, which posts that job.
 */
export default async function GetStartedPage({ searchParams }: Props) {
  const user = await getSignedInUser();
  if (user) redirect(homePath(user));
  const params = await searchParams;
  const need = typeof params.need === "string" ? params.need.trim().slice(0, 120) : "";

  return (
    <div className="sky-backdrop relative flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col items-center justify-center px-5 py-10 text-center sm:px-8">
        <Link href="/" aria-label="Hirvello home" className="rounded-md">
          <HirvelloLogo className="gap-3 [&>svg]:h-8 [&>span]:text-[28px]" />
        </Link>
        <h1 className="mt-9 text-[clamp(36px,4.4vw,60px)] leading-[1.05] font-medium tracking-[-0.04em] text-ink">
          Let&rsquo;s get started
        </h1>
        <p className="mt-3 text-[clamp(16px,1.3vw,20px)] leading-relaxed text-charcoal">Choose how you want to use Hirvello</p>
        {need && (
          <p className="sky-card mt-6 max-w-[52ch] rounded-full px-5 py-2.5 text-[14.5px] text-charcoal">
            Looking for <span className="font-medium text-ink">{need}</span>? Simple Hire turns that into a job that&rsquo;s ready to post.
          </p>
        )}

        <ul className="mt-10 grid w-full max-w-[960px] grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6">
          {ROLES.map(({ href, icon: Icon, title, text, action, simple }) => (
            <li key={href} className="flex">
              <Link
                href={href}
                className={cn(
                  "group sky-card flex w-full flex-col items-center rounded-[26px] px-6 pt-9 pb-7 text-center transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-glass-strong sm:min-h-[280px]",
                  need && simple && "ring-2 ring-accent/40",
                )}
              >
                <span className="flex size-[72px] items-center justify-center rounded-full bg-accent-soft text-brand-ink ring-1 ring-accent/10">
                  <Icon aria-hidden className="size-8" strokeWidth={1.6} />
                </span>
                <span className="mt-6 text-[24px] leading-tight font-semibold tracking-[-0.02em] text-ink">{title}</span>
                <span className="mt-2 max-w-[22ch] text-[15px] leading-snug text-charcoal">{text}</span>
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

        <p className="sky-card mt-9 rounded-full px-5 py-2.5 text-[15px] text-charcoal">
          Already have an account?{" "}
          <Link href="/signin" className="font-medium text-brand-ink underline underline-offset-4 transition-colors hover:text-ink">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
