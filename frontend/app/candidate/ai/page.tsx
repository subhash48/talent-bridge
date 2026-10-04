import type { Metadata } from "next";

import { AskAIView } from "@/components/candidate/AskAIView";

export const metadata: Metadata = { title: "Ask AI" };

export default function AskAIPage() {
  return <AskAIView />;
}
