import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hirvello",
    short_name: "Hirvello",
    description: "Talent is everywhere. Hirvello finds the real ones, and keeps recruiters and candidates informed throughout hiring.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F8FC",
    theme_color: "#14233B",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
