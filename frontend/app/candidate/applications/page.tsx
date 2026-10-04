import type { Metadata } from "next";

import { ApplicationsView } from "@/components/candidate/ApplicationsView";

export const metadata: Metadata = { title: "Applications" };

// Every application, grouped. The list comes from the portal state the layout already loaded.
export default function ApplicationsPage() {
  return <ApplicationsView />;
}
