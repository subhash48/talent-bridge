"use client";

import Link from "next/link";

import { CandidateNotifications } from "@/components/candidate/CandidateNotifications";
import { useCandidatePortal } from "@/components/candidate/CandidatePortalProvider";
import { Avatar } from "@/components/shared/Avatar";

/**
 * The notification bell and the candidate's avatar, which opens their profile. They sit in the top bar
 * on every page but the dashboard, which shows them beside its game's score instead.
 */
export function CandidateTopActions() {
  const { me } = useCandidatePortal();

  return (
    <div className="flex items-center gap-2">
      <CandidateNotifications />
      <Link href="/candidate/profile" aria-label="Your profile" className="rounded-full">
        <Avatar name={me.candidate.fullName} src={me.candidate.avatarUrl} size={40} className="rounded-full ring-2 ring-white/10" />
      </Link>
    </div>
  );
}
