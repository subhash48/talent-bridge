import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { CareersShell } from "@/components/careers/CareersShell";

export const metadata: Metadata = {
  // absolute: not the workspace's title suffix.
  title: { absolute: "Demo careers · Kavuntra", template: "%s · Demo careers · Kavuntra" },
  description: "A development demo of Kavuntra's careers site: these roles are not real.",
  // Made-up roles on a development server: keep them out of search engines.
  robots: { index: false, follow: false },
};

// The portals keep the cream canvas, so the browser's toolbar matches them rather than the website's sky.
export const viewport: Viewport = { themeColor: "#F2EDE3" };

// The public demo careers site (development only). There's no sign-in here, so proxy.ts, which only
// guards /recruiter and /candidate, leaves /demo alone; the API answers 404 while the demo is off.
export default function DemoLayout({ children }: { children: ReactNode }) {
  return <CareersShell>{children}</CareersShell>;
}
