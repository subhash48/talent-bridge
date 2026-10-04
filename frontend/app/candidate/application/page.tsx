import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NoApplication } from "@/components/candidate/ApplicationView";
import { selectedApplicationId } from "@/lib/selected-application-server";
import { getCandidateMe } from "@/services/portal";

export const metadata: Metadata = { title: "My Application" };

// The address the portal has always linked to. It opens the selected application (by default the
// latest active one) at its own address, /candidate/application/{id}.
export default async function MyApplicationPage() {
  const me = await getCandidateMe(await selectedApplicationId()).catch(() => undefined);
  if (me?.application) redirect(`/candidate/application/${me.application.id}`);
  return <NoApplication company={me?.company ?? "the company"} />;
}
