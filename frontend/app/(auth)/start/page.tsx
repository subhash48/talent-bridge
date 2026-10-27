import { BriefcaseBusiness, ChevronRight, Store, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard, authLinkStyles } from "@/components/auth/AuthCard";
import { homePath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";

export const metadata: Metadata = { title: "Get started" };

const CHOICES = [
  {
    href: "/signup/employer?mode=full",
    icon: BriefcaseBusiness,
    title: "A recruiting team",
    text: "The full workspace: pipeline, interviews, messages and the AI assistant.",
  },
  {
    href: "/signup/employer?mode=simple",
    icon: Store,
    title: "A small business",
    text: "Simple Hire: say who you need, and Kavuntra does the rest with you.",
  },
  {
    href: "/signup",
    icon: UserRound,
    title: "Looking for a job",
    text: "One account for every application, with clear next steps.",
  },
];

// The website's Get started: who it's for decides which account is made, so it asks first.
export default async function GetStartedPage() {
  const user = await getSignedInUser();
  if (user) redirect(homePath(user));

  return (
    <AuthCard
      title="How will you use Kavuntra?"
      description="Choose one. You can always sign in to the others later."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/signin" className={authLinkStyles}>
            Sign in
          </Link>
        </>
      }
    >
      <ul className="flex flex-col gap-3">
        {CHOICES.map(({ href, icon: Icon, title, text }) => (
          <li key={href}>
            <Link
              href={href}
              className="group sky-card flex items-center gap-4 rounded-[18px] p-4 transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-overlay/75"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-accent-soft/80 text-brand-ink">
                <Icon aria-hidden className="size-5" strokeWidth={1.75} />
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-ink">{title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-stone">{text}</span>
              </span>
              <ChevronRight aria-hidden className="size-4 text-faint transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </AuthCard>
  );
}
