import type { Metadata } from "next";

import { CandidatesSection } from "@/components/site/CandidatesSection";
import { SitePage } from "@/components/site/SitePage";

export const metadata: Metadata = {
  title: "For candidates",
  description: "One place for every application: where it stands, what happens next and how to prepare.",
};

export default function ForCandidatesPage() {
  return (
    <SitePage>
      <CandidatesSection />
    </SitePage>
  );
}
