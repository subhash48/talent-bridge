import type { Metadata } from "next";

import { CandidateDashboard } from "@/components/candidate/CandidateDashboard";

// The layout's title template only applies to child segments, so this page sets its title in full.
export const metadata: Metadata = { title: { absolute: "Dashboard · TalentBridge Candidate Portal" } };

export default function CandidateHomePage() {
  return <CandidateDashboard />;
}
