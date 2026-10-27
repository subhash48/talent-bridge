import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kavuntra",
    short_name: "Kavuntra",
    description: "Kavuntra keeps recruiters responsive and candidates informed throughout the hiring process.",
    start_url: "/",
    display: "standalone",
    background_color: "#F2EDE3",
    theme_color: "#224047",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
