import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
// Lets services/api.ts send the signed-in user's access token when rendering on the server.
import "@/lib/supabase-server";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: { default: "Encord Recruiting", template: "%s · Encord Recruiting" },
  description: "AI-powered recruiting workspace for the Encord hiring team.",
};

export const viewport: Viewport = {
  themeColor: "#031211",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
