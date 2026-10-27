import type { Metadata } from "next";

import { ProductSection } from "@/components/site/ProductSection";
import { SitePage } from "@/components/site/SitePage";

export const metadata: Metadata = {
  title: "Product",
  description: "What Kavuntra does: communication-gap detection, personalized recruiter updates, candidate application tracking, AI interview preparation and Simple Hire for small businesses.",
};

export default function ProductPage() {
  return (
    <SitePage>
      <ProductSection />
    </SitePage>
  );
}
