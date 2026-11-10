import { BriefcaseBusiness, ChevronRight, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard, authLinkStyles } from "@/components/auth/AuthCard";
import { landingPath, localPath, loginPath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

const CHOICES = [
  {
    audience: "candidate",
    icon: UserRound,
    title: "Candidate",
    text: "Follow your applications, messages and interviews.",
  },
  {
    audience: "employer",
    icon: BriefcaseBusiness,
    title: "Employer / Recruiter",
    text: "Open your company's workspace or Simple Hire.",
  },
] as const;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// The website's Sign in: it asks who you are rather than assuming a recruiter. ?next= goes on to the sign-in page.
export default async function SignInChooserPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = localPath(typeof params.next === "string" ? params.next : null);
  const user = await getSignedInUser();
  if (user) redirect(landingPath(user.role, next, user.workspace?.mode));

  return (
    <AuthCard
      title="How are you using Hirvello?"
      footer={
        <p>
          New here?{" "}
          <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className={authLinkStyles}>
            Create a candidate account
          </Link>{" "}
          or{" "}
          <Link href="/signup/employer" className={authLinkStyles}>
            set up your company
          </Link>
        </p>
      }
    >
      <ul className="flex flex-col gap-3">
        {CHOICES.map(({ audience, icon: Icon, title, text }) => (
          <li key={audience}>
            <Link
              href={loginPath({ audience, next })}
              className="group flex items-center gap-4 rounded-[14px] border border-border/70 bg-glass-strong p-3.5 transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px hover:border-accent/40 hover:bg-overlay"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-brand-ink ring-1 ring-accent/10">
                <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-ink">{title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-stone">{text}</span>
              </span>
              <ChevronRight
                aria-hidden
                className="size-4 text-faint transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </AuthCard>
  );
}
