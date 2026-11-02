import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { CareersShell } from "@/components/careers/CareersShell";

export const metadata: Metadata = {
  // absolute: not the workspace's title suffix.
  title: { absolute: "Demo careers · Hirvello", template: "%s · Demo careers · Hirvello" },
  description: "A development demo of Hirvello's careers site: these roles are not real.",
  // Made-up roles on a development server: keep them out of search engines.
  robots: { index: false, follow: false },
};

// The portals sit on the mist, so the browser's toolbar matches them rather than the website's sky.
export const viewport: Viewport = { themeColor: "#F4F8FC" };

// The public demo careers site (development only). There's no sign-in here, so proxy.ts, which only
// guards /recruiter and /candidate, leaves /demo alone; the API answers 404 while the demo is off.
export default function DemoLayout({ children }: { children: ReactNode }) {
  return <CareersShell>{children}</CareersShell>;
}
