import type { Metadata } from "next";

import { HireAssistant } from "@/components/hire/HireAssistant";

export const metadata: Metadata = { title: "Home" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Simple Hire's home: what would you like to do? Everything starts from the assistant. ?do=post (the Jobs
// page's Post a job) opens it ready to describe a job.
export default async function HireHomePage({ searchParams }: Props) {
  const params = await searchParams;
  return <HireAssistant start={params.do === "post" ? "post" : null} />;
}
