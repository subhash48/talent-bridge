import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SitePage } from "@/components/site/SitePage";

export const metadata: Metadata = {
  description:
    "Open jobs from recruiting teams and growing businesses hiring with Hirvello. Search, filter, and apply in a few minutes.",
};

// The public job board, on the website's sky with its header and footer. Nothing here needs an account: proxy.ts only
// guards /recruiter, /candidate and /hire. The loading skeletons and "isn't open" page render inside this frame too.
export default function JobsLayout({ children }: { children: ReactNode }) {
  return <SitePage>{children}</SitePage>;
}
