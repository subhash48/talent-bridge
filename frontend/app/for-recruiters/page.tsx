import type { Metadata } from "next";

import { RecruitersSection } from "@/components/site/RecruitersSection";
import { SitePage } from "@/components/site/SitePage";

export const metadata: Metadata = {
  title: "For recruiters",
  description: "A recruiting workspace that keeps every candidate informed, with an AI assistant you stay in control of.",
};

export default function ForRecruitersPage() {
  return (
    <SitePage>
      <RecruitersSection />
    </SitePage>
  );
}
