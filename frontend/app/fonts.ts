/*
 * Hirvello's typeface is Ranade, by Indian Type Foundry. It's a licensed font, so its files aren't in the repository,
 * and Manrope (the same weights: 400 regular, 500 medium, 600 semibold, 700 bold) stands in until they're added.
 *
 * To switch to Ranade, put the licensed files in frontend/app/fonts/ranade/ (Ranade-Regular.woff2, Ranade-Medium.woff2,
 * Ranade-Semibold.woff2, Ranade-Bold.woff2; or one Ranade-Variable.woff2 with weight "400 700"), then replace the
 * Manrope export below with the localFont block under it. Nothing else changes: every component reads --font-sans.
 */
import { Manrope } from "next/font/google";

export const sans = Manrope({ subsets: ["latin"], variable: "--font-hirvello", display: "swap" });

// import localFont from "next/font/local";
//
// export const sans = localFont({
//   src: [
//     { path: "./fonts/ranade/Ranade-Regular.woff2", weight: "400", style: "normal" },
//     { path: "./fonts/ranade/Ranade-Medium.woff2", weight: "500", style: "normal" },
//     { path: "./fonts/ranade/Ranade-Semibold.woff2", weight: "600", style: "normal" },
//     { path: "./fonts/ranade/Ranade-Bold.woff2", weight: "700", style: "normal" },
//   ],
//   variable: "--font-hirvello",
//   display: "swap",
// });
