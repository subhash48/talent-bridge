import type { Metadata } from "next";

import { PrepView } from "@/components/candidate/PrepView";

export const metadata: Metadata = { title: "Interview Prep" };

// Prep comes from the AI provider, which can be slow, so it loads in the browser behind a skeleton.
export default function InterviewPrepPage() {
  return <PrepView />;
}
