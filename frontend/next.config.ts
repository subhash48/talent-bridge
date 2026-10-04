import type { NextConfig } from "next";

// Short aliases for the recruiter workspace, which lives under /recruiter (ARCHITECTURE.md 11).
const RECRUITER_ALIASES = ["candidates", "jobs", "interviews", "messages", "ai"];

// A candidate portal page from the first prototype, now covered by Interview Prep.
const CANDIDATE_MOVES = [{ source: "/candidate/resources", destination: "/candidate/prep" }];

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
