import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
// Lets services/api.ts send the signed-in user's access token when rendering on the server.
import "@/lib/supabase-server";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
// The word that matters in a headline: an editorial serif, italic, in its one weight.
const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
});

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
    <html lang="en" className={cn(geist.variable, instrumentSerif.variable)}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
