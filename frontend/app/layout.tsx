import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
// Lets services/api.ts send the signed-in user's access token when rendering on the server.
import "@/lib/supabase-server";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

const DESCRIPTION = "Kavuntra keeps recruiters responsive and candidates informed throughout the hiring process.";

export const metadata: Metadata = {
  title: { default: "Kavuntra", template: "%s · Kavuntra" },
  description: DESCRIPTION,
  applicationName: "Kavuntra",
  openGraph: { type: "website", siteName: "Kavuntra", title: "Kavuntra", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Kavuntra", description: DESCRIPTION },
};

// The website's sky. The portals (recruiter, candidate, Simple Hire, careers) keep their cream: see their layouts.
export const viewport: Viewport = {
  themeColor: "#DFE1E8",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
