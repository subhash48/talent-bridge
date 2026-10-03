import type { NextConfig } from "next";

// Short aliases for the recruiter workspace, which lives under /recruiter (ARCHITECTURE.md 11).
const RECRUITER_ALIASES = ["candidates", "jobs", "interviews", "messages", "ai"];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/dashboard", destination: "/recruiter/candidates", permanent: false },
      ...RECRUITER_ALIASES.map((path) => ({
        source: `/${path}`,
        destination: `/recruiter/${path}`,
        permanent: false,
      })),
    ];
  },
};

export default nextConfig;
