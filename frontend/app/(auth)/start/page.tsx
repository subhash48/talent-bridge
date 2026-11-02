import { ArrowRight, Store, UserRound, Users, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { HirvelloLogo } from "@/components/shared/HirvelloLogo";
import { homePath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign up" };

// Who it's for decides which account is made, so Sign up asks first. Each is one card of glass on the sky: what
// you're here for, the account that fits, and where it leads.
const ROLES: { href: string; icon: LucideIcon; who: string; title: string; text: string; action: string; simple?: boolean }[] = [
  {
    href: "/signup",
    icon: UserRound,
    who: "I'm looking for a job",
    title: "Candidate",
    text: "Follow your applications, messages and interviews in one portal.",
    action: "Continue as a candidate",
  },
  {
    href: "/signup/employer?mode=full",
    icon: Users,
    who: "I'm hiring",
    title: "Recruiter / Employer",
    text: "A workspace for your pipeline, with every candidate kept informed.",
    action: "Continue as a recruiter",
  },
  {
    href: "/signup/employer?mode=simple",
    icon: Store,
    who: "I run a small business",
    title: "Small business",
    text: "Post a job by describing it, see who applied and talk to them.",
    action: "Continue with Simple Hire",
    simple: true,
  },
];

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The website's Sign up: the sky, the mark, and three cards of the same size, one per way of using Hirvello. The
 * whole card is the link; the arrow at its foot only shows where it leads. Arriving from the home page's concierge
 * with what you need (?need=), the page says so and points at Simple Hire, which posts that job.
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
          <HirvelloLogo className="gap-2.5 [&>svg]:h-7 [&>span]:text-[24px]" />
        </Link>
        <h1 className="mt-8 text-[clamp(30px,3.4vw,44px)] leading-[1.1] font-bold tracking-[-0.03em] text-ink">Get started with Hirvello</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-charcoal sm:text-[17px]">
          Choose how you&rsquo;ll use it, and we&rsquo;ll set up the right account.
        </p>
        {need && (
          <p className="sky-card mt-5 max-w-[52ch] rounded-full px-5 py-2.5 text-[14.5px] text-charcoal">
            Looking for <span className="font-semibold text-ink">{need}</span>? Simple Hire turns that into a job that&rsquo;s ready to post.
          </p>
        )}

        <ul className="mt-8 grid w-full max-w-[960px] grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
          {ROLES.map(({ href, icon: Icon, who, title, text, action, simple }) => (
            <li key={href} className="flex">
              <Link
                href={href}
                className={cn(
                  "group sky-card flex w-full flex-col items-center rounded-[20px] px-5 pt-7 pb-6 text-center transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-glass-strong sm:min-h-[260px]",
                  need && simple && "ring-2 ring-accent/40",
                )}
              >
                <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-brand-ink ring-1 ring-accent/10">
                  <Icon aria-hidden className="size-6" strokeWidth={1.6} />
                </span>
                <span className="mt-5 text-[12px] font-semibold tracking-[0.12em] text-brand-ink uppercase">{who}</span>
                <span className="mt-1.5 text-[20px] leading-tight font-semibold tracking-[-0.015em] text-ink">{title}</span>
                <span className="mt-2 max-w-[26ch] text-[14.5px] leading-snug text-charcoal">{text}</span>
                <span className="mt-auto flex pt-6">
                  <span className="flex size-10 items-center justify-center rounded-full bg-brand text-on-brand shadow-raised transition-transform duration-200 group-hover:translate-x-0.5">
                    <ArrowRight aria-hidden className="size-4.5" />
                    <span className="sr-only">{action}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="sky-card mt-8 rounded-full px-5 py-2.5 text-[15px] text-charcoal">
          Already have an account?{" "}
          <Link href="/signin" className="font-semibold text-brand-ink underline underline-offset-4 transition-colors hover:text-ink">
            Log in
          </Link>
        </p>
      </main>
    </div>
  );
}
