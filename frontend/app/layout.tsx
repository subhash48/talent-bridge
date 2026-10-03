import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  title: "HireMesh",
  description: "One recruiting system, two experiences.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${instrumentSerif.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
