import type { Metadata } from "next";

import { ProfileView } from "@/components/candidate/ProfileView";
import { getCandidateProfile } from "@/services/portal";

export const metadata: Metadata = { title: "Profile" };

export default async function CandidateProfilePage() {
  const profile = await getCandidateProfile().catch(() => undefined);
  return <ProfileView initialProfile={profile} />;
}
