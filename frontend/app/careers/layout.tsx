import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CareersShell } from "@/components/careers/CareersShell";

export const metadata: Metadata = {
  // absolute: not the workspace's title suffix.
  title: { absolute: "Careers at Encord", template: "%s · Careers at Encord" },
  description: "Open roles at Encord. Apply in a few minutes and follow your application in your candidate portal.",
};

// The company's careers site, run by TalentBridge. No sign-in here: proxy.ts only guards /recruiter and
// /candidate, so /careers is public, and applying needs no account.
export default function CareersLayout({ children }: { children: ReactNode }) {
  return <CareersShell site="native">{children}</CareersShell>;
}
