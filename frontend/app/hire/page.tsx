import type { Metadata } from "next";

import { HireAssistant } from "@/components/hire/HireAssistant";

export const metadata: Metadata = { title: "Home" };

// Simple Hire's home: what would you like to do? Everything starts from the assistant.
export default function HireHomePage() {
  return <HireAssistant />;
}
