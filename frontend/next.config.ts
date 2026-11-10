import type { NextConfig } from "next";

import { DEMO_BOOKING_URL } from "./lib/booking";

// Short aliases for the recruiter workspace, which lives under /recruiter (ARCHITECTURE.md 11). /jobs isn't one:
// it's the public job board.
const RECRUITER_ALIASES = ["candidates", "interviews", "messages", "analytics", "ai"];

// A candidate portal page from the first prototype, now covered by Interview Prep.
const CANDIDATE_MOVES = [{ source: "/candidate/resources", destination: "/candidate/prep" }];

// The job board was the careers site at /careers: links people saved and shared keep working. Not permanent, so
// the old paths stay free. The demo careers site keeps /demo/careers, and Hirvello's own hiring page is /about/careers.
const CAREERS_MOVES = [
  { source: "/careers", destination: "/jobs" },
  { source: "/careers/:jobId", destination: "/jobs/:jobId" },
  { source: "/careers/:jobId/apply", destination: "/jobs/:jobId/apply" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/dashboard", destination: "/recruiter/today", permanent: false },
      // Book a demo is the Google Calendar booking page now; the old page's address goes there too.
      { source: "/book-a-demo", destination: DEMO_BOOKING_URL, permanent: false },
      ...RECRUITER_ALIASES.map((path) => ({
        source: `/${path}`,
        destination: `/recruiter/${path}`,
        permanent: false,
      })),
      ...CANDIDATE_MOVES.map((move) => ({ ...move, permanent: false })),
      ...CAREERS_MOVES.map((move) => ({ ...move, permanent: false })),
    ];
  },
};

export default nextConfig;
