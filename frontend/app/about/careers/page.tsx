import type { Metadata } from "next";

import { CompanyCareersSection } from "@/components/site/CompanyCareersSection";
import { SitePage } from "@/components/site/SitePage";

export const metadata: Metadata = {
  title: "Careers",
  description: "Working at Kavuntra: the tools that make hiring clearer, simpler and more human.",
};

// Working at Kavuntra. The job board, the open roles of the companies hiring with Kavuntra, stays at /careers.
export default function CompanyCareersPage() {
  return (
    <SitePage>
      <CompanyCareersSection />
    </SitePage>
  );
}
