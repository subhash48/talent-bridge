import type { NextConfig } from "next";

// Short aliases for the recruiter workspace, which lives under /recruiter (ARCHITECTURE.md 11).
const RECRUITER_ALIASES = ["candidates", "jobs", "interviews", "messages", "ai"];

// Candidate portal pages from the first prototype, now covered by Interview Prep and My Application.
const CANDIDATE_MOVES = [
  { source: "/candidate/ai", destination: "/candidate/prep" },
  { source: "/candidate/resources", destination: "/candidate/prep" },
  { source: "/candidate/company", destination: "/candidate/application" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/dashboard", destination: "/recruiter/candidates", permanent: false },
      ...RECRUITER_ALIASES.map((path) => ({
        source: `/${path}`,
        destination: `/recruiter/${path}`,
        permanent: false,
      })),
      ...CANDIDATE_MOVES.map((move) => ({ ...move, permanent: false })),
    ];
  },
};

export default nextConfig;
