import type { Metadata } from "next";

import { ProductSection } from "@/components/site/ProductSection";
import { SitePage } from "@/components/site/SitePage";

export const metadata: Metadata = {
  title: "Product",
  description:
    "What Hirvello does: it notices which candidates are waiting, drafts the update for a recruiter to approve, shows candidates where they stand, helps them prepare, and gives small businesses Simple Hire.",
};

export default function ProductPage() {
  return (
    <SitePage>
      <ProductSection />
    </SitePage>
  );
}
