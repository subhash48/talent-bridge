import type { Metadata } from "next";

import { HireApplicants } from "@/components/hire/HireApplicants";

export const metadata: Metadata = { title: "Applicants" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// ?job= (from the Jobs page): that job's applicants.
export default async function HireApplicantsPage({ searchParams }: Props) {
  const params = await searchParams;
  return <HireApplicants initialJob={typeof params.job === "string" ? params.job : null} />;
}
