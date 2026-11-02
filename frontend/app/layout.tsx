import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { sans } from "./fonts";
import "./globals.css";
// Lets services/api.ts send the signed-in user's access token when rendering on the server.
import "@/lib/supabase-server";

const DESCRIPTION = "Talent is everywhere. Hirvello finds the real ones, and keeps recruiters and candidates informed throughout hiring.";

export const metadata: Metadata = {
  title: { default: "Hirvello", template: "%s · Hirvello" },
  description: DESCRIPTION,
  applicationName: "Hirvello",
  openGraph: { type: "website", siteName: "Hirvello", title: "Hirvello", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Hirvello", description: DESCRIPTION },
};

// The website's sky. The portals (recruiter, candidate, Simple Hire, careers) sit on the mist: see their layouts.
export const viewport: Viewport = {
  themeColor: "#EEF4FC",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
