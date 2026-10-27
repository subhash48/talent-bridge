import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { CareersShell } from "@/components/careers/CareersShell";

export const metadata: Metadata = {
  // absolute: not the workspace's title suffix.
  title: { absolute: "Careers · Kavuntra", template: "%s · Careers · Kavuntra" },
  description: "Open roles at companies hiring with Kavuntra. Apply in a few minutes and follow your application in your candidate portal.",
};

// The portals keep the cream canvas, so the browser's toolbar matches them rather than the website's sky.
export const viewport: Viewport = { themeColor: "#F2EDE3" };

// Kavuntra's careers site: open roles from the companies hiring with it, each named on its role. No sign-in here: proxy.ts only guards /recruiter and
// /candidate, so /careers is public, and applying needs no account.
export default function CareersLayout({ children }: { children: ReactNode }) {
  return <CareersShell site="native">{children}</CareersShell>;
}
